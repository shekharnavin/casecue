const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const PKG = require(path.join(__dirname, '..', 'package.json'));

const isDev = process.env.CASECUE_DEV === '1';
const VITE_URL = 'http://localhost:5173';
const SERVER_PORT = Number(process.env.PORT || 4005);

let mainWindow = null;
let serverProcess = null;
let serverStartedHere = false;
// True only during an intentional quit (--quit / in-app Quit / real app.quit()).
// Lets the window's `close` handler tell "user clicked X" (hide) apart from
// "actually shutting down" (let it close and stop the server).
let isQuitting = false;

function hasFlag(argv, flag) {
  return Array.isArray(argv) && argv.includes(flag);
}

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

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow(false);
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

// Let the renderer open the logs folder (Settings → Open logs folder).
ipcMain.handle('casecue:open-logs', async () => {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  return shell.openPath(logsDir);
});

// Native dialogs (window.confirm/alert) steal keyboard focus from the page in
// Electron — after one closes, inputs stop accepting typing until the web
// contents is re-focused. The renderer calls this right after any confirm().
ipcMain.handle('casecue:refocus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  return true;
});

// Renderer-triggered "Hide" button — same as clicking the window's X.
ipcMain.handle('casecue:hide-window', () => {
  hideWindow();
  return true;
});

// Renderer-triggered "Quit CaseCue" — fully stops the app and its background server.
ipcMain.handle('casecue:quit-app', () => {
  quitApp();
  return true;
});

function createMainWindow(startHidden) {
  mainWindow = new BrowserWindow({
    backgroundColor: '#f5f7fb',
    height: 800,
    minHeight: 600,
    minWidth: 900,
    show: false,
    title: 'CaseCue',
    webPreferences: {
      // Pass the version through argv rather than having preload.js require()
      // package.json — preload runs in a stricter Node context and that
      // require silently threw there, aborting the whole preload script (so
      // NONE of window.casecue was exposed, not just the version field).
      additionalArguments: [`--casecue-version=${PKG.version}`],
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    width: 1200,
  });

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      mainWindow.show();
    }
  });

  // When the window regains focus, make sure the page (not a lingering native
  // dialog) has keyboard focus, so typing works.
  mainWindow.on('focus', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
  });

  // Clicking the X hides the app instead of quitting, so the background
  // server (scheduler, email checks) keeps running. Use `casecue quit` (or
  // Settings → Quit CaseCue) to actually shut it down.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
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
  // A second `CaseCue.exe` launch (e.g. `casecue show` / `casecue hide` /
  // `casecue quit`, or just double-clicking the exe again) forwards its
  // command-line here instead of opening a second window.
  app.on('second-instance', (_event, argv) => {
    if (hasFlag(argv, '--quit')) {
      quitApp();
    } else if (hasFlag(argv, '--hidden')) {
      hideWindow();
    } else {
      showWindow();
    }
  });

  app.whenReady().then(() => {
    startServerIfNeeded();
    createMainWindow(hasFlag(process.argv, '--hidden'));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(false);
      } else {
        showWindow();
      }
    });
  });

  // Only reached on a genuine quit (windows are hidden, not closed, on a
  // normal X click) — safe to stop the background server here too.
  app.on('window-all-closed', () => {
    if (isQuitting && process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopServer();
  });
}
