const { app, BrowserWindow, ipcMain, webContents } = require('electron');
const path = require('path');

let mainWindow = null;
let captureInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // Crucial: enables <webview> inside the React frontend
    },
    title: "Visual Data Pipeline Desktop Client",
    backgroundColor: "#020617", // Slate-950 background
  });

  // In development, load from the Vite server
  mainWindow.loadURL('http://localhost:5173');

  // Open the DevTools for development assistance if requested
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    stopCaptureLoop();
    mainWindow = null;
  });
}

function stopCaptureLoop() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    console.log("Screenshot capture loop stopped.");
  }
}

// IPC Handlers
ipcMain.on('start-capture', (event, config) => {
  stopCaptureLoop(); // Clear any existing loop first

  let sessionId;
  let scale = 0.5;
  let quality = 70;

  if (typeof config === 'string') {
    sessionId = config;
  } else {
    sessionId = config.sessionId;
    scale = config.scale ?? scale;
    quality = config.quality ?? quality;
  }

  console.log(`Starting capture loop for session: ${sessionId} (Scale: ${scale}, Quality: ${quality})`);

  let frameSequence = 0;

  // Wait a short moment to ensure the webview WebContents is initialized
  setTimeout(() => {
    const allWebContents = webContents.getAllWebContents();
    
    // The webview's WebContents is the guest WebContents that is NOT the main window itself
    const webviewWebContents = allWebContents.find(
      wc => wc !== mainWindow.webContents && wc.getType() === 'webview'
    );

    if (!webviewWebContents) {
      console.error("Capture failed: No webview WebContents found.");
      event.reply('screenshot-error', 'Embedded webview browser not found.');
      return;
    }

    console.log("Webview WebContents successfully located. Starting 3 FPS capture.");

    // Track navigation within the webview and notify the frontend
    const sendNavigationUpdate = () => {
      if (!webviewWebContents.isDestroyed() && mainWindow) {
        mainWindow.webContents.send('webview-navigated', webviewWebContents.getURL());
      }
    };

    webviewWebContents.on('did-navigate', sendNavigationUpdate);
    webviewWebContents.on('did-navigate-in-page', sendNavigationUpdate);

    // Track the last captured thumbnail buffer and URL to avoid capturing duplicate content
    let lastThumbnailBuffer = null;
    let lastUrl = null;

    // Capture every 333ms (3 FPS)
    captureInterval = setInterval(async () => {
      try {
        if (webviewWebContents.isDestroyed()) {
          stopCaptureLoop();
          return;
        }

        const currentUrl = webviewWebContents.getURL();
        const image = await webviewWebContents.capturePage();
        
        // Visual Change Detection: resize image to 16x16 pixels to filter out cursor blinks/minor animations
        const thumbnail = image.resize({ width: 16, height: 16, quality: 'good' });
        const currentThumbnailBuffer = thumbnail.toBitmap();
        const isChanged = !lastThumbnailBuffer || lastUrl !== currentUrl || !lastThumbnailBuffer.equals(currentThumbnailBuffer);

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
              quality: 'better'
            });
          }

          const base64Image = processedImage.toJPEG(quality).toString('base64');

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('screenshot-captured', {
              image: base64Image,
              url: currentUrl,
              timestamp: new Date().toISOString(),
              sequence: frameSequence
            });
          }
        }
      } catch (err) {
        console.error("Error capturing page:", err);
      }
    }, 333);
  }, 500); // 500ms delay to let webview load guest processes
});

ipcMain.on('stop-capture', () => {
  stopCaptureLoop();
});

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
