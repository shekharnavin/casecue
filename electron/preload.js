const { contextBridge, ipcRenderer } = require('electron');

// Passed in via BrowserWindow webPreferences.additionalArguments (see main.js) —
// requiring package.json directly from preload.js is unreliable in some
// Electron configurations, so the version is threaded through argv instead.
function readVersionArg() {
  const arg = process.argv.find((entry) => entry.startsWith('--casecue-version='));
  return arg ? arg.slice('--casecue-version='.length) : '';
}

contextBridge.exposeInMainWorld('casecue', {
  apiBase: `http://localhost:${process.env.PORT || 4005}`,
  // The exact .exe currently running this window — helps confirm you're
  // looking at the build you think you are (see Settings → Application).
  execPath: process.execPath,
  isElectron: true,
  openLogs: () => ipcRenderer.invoke('casecue:open-logs'),
  refocus: () => ipcRenderer.invoke('casecue:refocus'),
  hideWindow: () => ipcRenderer.invoke('casecue:hide-window'),
  quitApp: () => ipcRenderer.invoke('casecue:quit-app'),
  version: readVersionArg(),
});
