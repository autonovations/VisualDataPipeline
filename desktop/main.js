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
ipcMain.on('start-capture', (event, sessionId) => {
  stopCaptureLoop(); // Clear any existing loop first
  console.log(`Starting capture loop for session: ${sessionId}`);

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

    // Capture every 333ms (3 FPS)
    captureInterval = setInterval(async () => {
      try {
        if (webviewWebContents.isDestroyed()) {
          stopCaptureLoop();
          return;
        }

        const image = await webviewWebContents.capturePage();
        const base64Image = image.toJPEG(85).toString('base64');
        const currentUrl = webviewWebContents.getURL();

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('screenshot-captured', {
            image: base64Image,
            url: currentUrl,
            timestamp: new Date().toISOString()
          });
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
