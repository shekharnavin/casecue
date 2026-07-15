const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

// Let the renderer open the logs folder (Settings → Open logs folder).
ipcMain.handle('casecue:open-logs', async () => {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  return shell.openPath(logsDir);
});

// Native dialogs (window.confirm/alert) steal keyboard focus from the page in
// Electron — after one closes, inputs stop accepting typing until the web
// contents is re-focused. The renderer calls this right after any confirm().
ipcMain.handle('casecue:refocus', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  return true;
});

const isDev = process.env.CASECUE_DEV === '1';
const VITE_URL = 'http://localhost:5173';
const SERVER_PORT = Number(process.env.PORT || 4005);

let mainWindow = null;
let serverProcess = null;
let serverStartedHere = false;

function startServerIfNeeded() {
  if (isDev) {
    return;
  }

  serverStartedHere = true;
  const serverEntry = path.join(__dirname, '..', 'server', 'live-court-server.js');
  // eng.traineddata is shipped next to the app root (see build.files); point the
  // OCR solver at it so captcha solving works with no internet on first run.
  const tessdataDir = path.join(__dirname, '..');

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      // Run the Electron binary as a plain Node process for the backend.
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(SERVER_PORT),
      // The app bundle is read-only; keep the data file in the user's profile.
      CASECUE_DATA_DIR: app.getPath('userData'),
      CASECUE_TESSDATA_DIR: tessdataDir,
    },
    stdio: 'inherit',
  });

  serverProcess.on('exit', (code) => {
    console.log(`[electron] server exited with code ${code}`);
    serverProcess = null;
  });
}

function stopServer() {
  if (serverProcess && serverStartedHere) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: '#f5f7fb',
    height: 800,
    minHeight: 600,
    minWidth: 900,
    show: false,
    title: 'CaseCue',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    width: 1200,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // When the window regains focus, make sure the page (not a lingering native
  // dialog) has keyboard focus, so typing works.
  mainWindow.on('focus', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(VITE_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startServerIfNeeded();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    stopServer();
  });
}
