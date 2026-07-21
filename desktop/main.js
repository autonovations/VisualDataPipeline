const { app, BrowserWindow, ipcMain, webContents } = require('electron');
const path = require('path');

let mainWindow = null;
let captureWindow = null; // Hidden window dedicated to capture at desktop resolution
let captureInterval = null;

// Default desktop resolution for capture
const DEFAULT_RESOLUTION = { width: 1920, height: 1080 };

// Desktop User-Agent to ensure sites render desktop layouts
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // Enables <webview> inside the React frontend for preview
    },
    title: 'Visual Data Pipeline Desktop Client',
    backgroundColor: '#020617', // Slate-950 background
  });

  // In development, load from the Vite server
  mainWindow.loadURL('http://localhost:5173');

  // Open the DevTools for development assistance if requested
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    stopCaptureLoop();
    destroyCaptureWindow();
    mainWindow = null;
  });
}

// ───────────────────────────────────────────────────────────
// Hidden Capture Window — Renders sites at REAL desktop resolution
// ───────────────────────────────────────────────────────────

function createCaptureWindow(url, resolution = DEFAULT_RESOLUTION) {
  // Destroy any existing capture window first
  destroyCaptureWindow();

  captureWindow = new BrowserWindow({
    width: resolution.width,
    height: resolution.height,
    show: false, // INVISIBLE — does not affect UI
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Force desktop User-Agent so websites render desktop layouts
  captureWindow.webContents.setUserAgent(DESKTOP_USER_AGENT);

  // Load the target URL
  captureWindow.loadURL(url);

  // Track navigation within the capture window and notify the frontend
  const sendNavigationUpdate = () => {
    if (captureWindow && !captureWindow.isDestroyed() && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('webview-navigated', captureWindow.webContents.getURL());
    }
  };

  captureWindow.webContents.on('did-navigate', sendNavigationUpdate);
  captureWindow.webContents.on('did-navigate-in-page', sendNavigationUpdate);

  console.log(
    `Capture window created: ${resolution.width}x${resolution.height} — URL: ${url}`
  );

  return captureWindow;
}

function destroyCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.close();
    captureWindow = null;
    console.log('Capture window destroyed.');
  }
}

// ───────────────────────────────────────────────────────────
// Capture Loop
// ───────────────────────────────────────────────────────────

function stopCaptureLoop() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    console.log('Screenshot capture loop stopped.');
  }
}

// IPC Handlers
ipcMain.on('start-capture', (event, config) => {
  stopCaptureLoop(); // Clear any existing loop first

  let sessionId;
  let scale = 1.0; // Default to full resolution for storage quality
  let quality = 85; // Higher default quality for analysis-ready images
  let resolution = DEFAULT_RESOLUTION;

  if (typeof config === 'string') {
    sessionId = config;
  } else {
    sessionId = config.sessionId;
    scale = config.scale ?? scale;
    quality = config.quality ?? quality;
    resolution = config.resolution ?? resolution;
  }

  console.log(
    `Starting capture for session: ${sessionId} ` +
    `(Resolution: ${resolution.width}x${resolution.height}, ` +
    `Scale: ${scale}, Quality: ${quality})`
  );

  // Ensure URL has a protocol
  let targetUrl = config.url || 'about:blank';
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  // Create the hidden capture window at the desired desktop resolution
  createCaptureWindow(targetUrl, resolution);

  let frameSequence = 0;

  // Track the last captured thumbnail buffer and URL to avoid duplicate content
  let lastThumbnailBuffer = null;
  let lastUrl = null;

  // Capture stats
  let totalBytes = 0;
  let duplicateCount = 0;

  // Wait for the capture window page to finish loading
  const startCapture = () => {
    console.log(
      `Capture window ready. Starting 3 FPS capture at ${resolution.width}x${resolution.height}.`
    );

    // Capture every 333ms (3 FPS)
    captureInterval = setInterval(async () => {
      try {
        if (!captureWindow || captureWindow.isDestroyed()) {
          stopCaptureLoop();
          return;
        }

        const currentUrl = captureWindow.webContents.getURL();
        const image = await captureWindow.webContents.capturePage();

        // Visual Change Detection: resize to 16x16 to filter cursor blinks/minor animations
        const thumbnail = image.resize({ width: 16, height: 16, quality: 'good' });
        const currentThumbnailBuffer = thumbnail.toBitmap();
        const isChanged =
          !lastThumbnailBuffer ||
          lastUrl !== currentUrl ||
          !lastThumbnailBuffer.equals(currentThumbnailBuffer);

        if (isChanged) {
          lastThumbnailBuffer = currentThumbnailBuffer;
          lastUrl = currentUrl;
          frameSequence++;

          // Apply scale adjustment if not 100%
          let processedImage = image;
          if (scale !== 1.0) {
            const size = image.getSize();
            processedImage = image.resize({
              width: Math.round(size.width * scale),
              height: Math.round(size.height * scale),
              quality: 'better',
            });
          }

          // Get image as JPEG buffer (binary)
          const jpegBuffer = processedImage.toJPEG(quality);
          totalBytes += jpegBuffer.length;

          // Get the original (full-res) capture size for metadata
          const captureSize = image.getSize();
          const outputSize = processedImage.getSize();

          if (mainWindow && !mainWindow.isDestroyed()) {
            // Send binary buffer + metadata to the renderer process
            mainWindow.webContents.send('screenshot-captured', {
              imageBuffer: jpegBuffer, // Binary Buffer
              url: currentUrl,
              timestamp: new Date().toISOString(),
              sequence: frameSequence,
              // Enriched metadata for backend storage
              capture: {
                resolution: { width: captureSize.width, height: captureSize.height },
                scale: scale,
                quality: quality,
                outputSize: { width: outputSize.width, height: outputSize.height },
                fileSizeBytes: jpegBuffer.length,
              },
            });
          }
        } else {
          duplicateCount++;
        }

        // Send periodic stats to the frontend
        if (frameSequence % 10 === 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('capture-stats', {
            totalFrames: frameSequence,
            duplicatesSkipped: duplicateCount,
            totalBytes: totalBytes,
            currentUrl: lastUrl,
          });
        }
      } catch (err) {
        console.error('Error capturing page:', err);
      }
    }, 333);
  };

  // Wait for page load before starting capture
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.webContents.on('did-finish-load', () => {
      // Additional small delay for JS-rendered content
      setTimeout(startCapture, 500);
    });

    // Fallback in case the page takes too long
    setTimeout(() => {
      if (!captureInterval) {
        console.log('Fallback: Starting capture even though page may not be fully loaded.');
        startCapture();
      }
    }, 5000);
  }
});

ipcMain.on('stop-capture', () => {
  stopCaptureLoop();
  destroyCaptureWindow();
});

// Allow the renderer to change capture resolution mid-session
ipcMain.on('set-resolution', (_event, resolution) => {
  console.log(`Resolution change requested: ${resolution.width}x${resolution.height}`);
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.setSize(resolution.width, resolution.height);
    console.log(`Capture window resized to ${resolution.width}x${resolution.height}`);
  }
});

// One-shot capture for preview purposes
ipcMain.handle('capture-once', async () => {
  if (!captureWindow || captureWindow.isDestroyed()) {
    return null;
  }
  try {
    const image = await captureWindow.webContents.capturePage();
    return image.toJPEG(75).toString('base64');
  } catch (err) {
    console.error('Error in single capture:', err);
    return null;
  }
});

// ───────────────────────────────────────────────────────────
// App Lifecycle
// ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
