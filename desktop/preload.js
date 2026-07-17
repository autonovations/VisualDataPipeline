const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startCapture: (sessionId) => ipcRenderer.send('start-capture', sessionId),
  stopCapture: () => ipcRenderer.send('stop-capture'),
  onScreenshot: (callback) => {
    const subscription = (event, data) => callback(event, data);
    ipcRenderer.on('screenshot-captured', subscription);
    return () => {
      ipcRenderer.removeListener('screenshot-captured', subscription);
    };
  },
  onWebviewNavigate: (callback) => {
    const subscription = (event, url) => callback(event, url);
    ipcRenderer.on('webview-navigated', subscription);
    return () => {
      ipcRenderer.removeListener('webview-navigated', subscription);
    };
  }
});
