const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Capture controls
  startCapture: (config) => ipcRenderer.send('start-capture', config),
  stopCapture: () => ipcRenderer.send('stop-capture'),

  // Resolution control
  setResolution: (resolution) => ipcRenderer.send('set-resolution', resolution),

  // One-shot capture for preview (returns base64 string)
  captureOnce: () => ipcRenderer.invoke('capture-once'),

  // Screenshot stream listener (receives binary buffer + metadata)
  onScreenshot: (callback) => {
    const subscription = (event, data) => callback(event, data);
    ipcRenderer.on('screenshot-captured', subscription);
    return () => {
      ipcRenderer.removeListener('screenshot-captured', subscription);
    };
  },

  // Navigation tracking from the capture window
  onWebviewNavigate: (callback) => {
    const subscription = (event, url) => callback(event, url);
    ipcRenderer.on('webview-navigated', subscription);
    return () => {
      ipcRenderer.removeListener('webview-navigated', subscription);
    };
  },

  // Capture statistics stream
  onCaptureStats: (callback) => {
    const subscription = (event, stats) => callback(event, stats);
    ipcRenderer.on('capture-stats', subscription);
    return () => {
      ipcRenderer.removeListener('capture-stats', subscription);
    };
  },
});
