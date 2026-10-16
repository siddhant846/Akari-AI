const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop capabilities to React frontend
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
  getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
  togglePetMode: (enable) => ipcRenderer.invoke('window:togglePetMode', enable),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore, options),
  activateWindow: (data) => ipcRenderer.invoke('window:activate', data),
  onWakeWord: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('wake-word-triggered', handler);
    return () => ipcRenderer.removeListener('wake-word-triggered', handler);
  },
});
