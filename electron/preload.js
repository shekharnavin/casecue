const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('casecue', {
  apiBase: `http://localhost:${process.env.PORT || 4005}`,
  isElectron: true,
});
