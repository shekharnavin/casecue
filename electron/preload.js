const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('casecue', {
  apiBase: `http://localhost:${process.env.PORT || 4005}`,
  isElectron: true,
  openLogs: () => ipcRenderer.invoke('casecue:open-logs'),
  refocus: () => ipcRenderer.invoke('casecue:refocus'),
});
