const { app, BrowserWindow, ipcMain, session, Menu, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let isQuitting = false;
const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Enable WebGL & Hardware Acceleration for Live2D PixiJS rendering
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function checkServerReady(url, maxRetries = 60, intervalMs = 300) {
  return new Promise((resolve) => {
    let retries = 0;
    const probe = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => {
        retry();
      });
      req.setTimeout(800, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        console.warn(`[Electron] Server at ${url} did not respond within timeout, proceeding anyway.`);
        resolve(false);
      } else {
        setTimeout(probe, intervalMs);
      }
    };

    probe();
  });
}

function startBackendServer() {
  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  const projectRoot = path.resolve(__dirname, '..');

  console.log(`[Electron] Launching backend server in ${isDev ? 'DEV' : 'PROD'} mode...`);

  if (isDev) {
    // In dev mode, tsx server.ts is launched by npm script or spawned here
    backendProcess = spawn('npx.cmd', ['tsx', 'server.ts'], {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, PORT: String(PORT) },
    });
    backendProcess.on('error', (err) => {
      console.error('[Electron] Failed to start dev backend process:', err);
    });
  } else {
    // In production mode, run compiled dist/server.cjs directly in-process
    process.env.ELECTRON_PROD = "1";
    process.env.NODE_ENV = "production";
    process.env.PORT = String(PORT);

    const candidates = [
      path.join(projectRoot, 'dist', 'server.cjs'),
      path.join(__dirname, '..', 'dist', 'server.cjs'),
      path.join(process.resourcesPath || '', 'app.asar', 'dist', 'server.cjs'),
      path.join(process.resourcesPath || '', 'app', 'dist', 'server.cjs'),
    ];

    const serverScript = candidates.find((p) => p && fs.existsSync(p));
    if (serverScript) {
      try {
        console.log(`[Electron] Loading in-process backend server: ${serverScript}`);
        require(serverScript);
        console.log('[Electron] In-process backend server initialized!');
      } catch (err) {
        console.error('[Electron] Failed to load in-process backend server:', err);
      }
    } else {
      console.error('[Electron] Could not locate dist/server.cjs in candidates:', candidates);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Akari AI - Desktop Assistant',
    backgroundColor: '#0b0f19',
    show: false, // Show when ready to prevent flicker
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false, // Keep Live2D & Voice running smoothly even in background
    },
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  // Auto-grant microphone, audio, and screen capture permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'notifications', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'notifications', 'display-capture'];
    return allowedPermissions.includes(permission);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.warn(`[Electron] Page failed to load (${errorCode}: ${errorDescription}), retrying in 1s...`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(SERVER_URL);
      }
    }, 1000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load Akari Application
  mainWindow.loadURL(SERVER_URL).catch((err) => {
    console.error('[Electron] Failed to load URL, retrying in 1s...', err);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(SERVER_URL);
    }, 1000);
  });
}

// IPC Handlers
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:setAlwaysOnTop', (event, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(Boolean(flag));
    return mainWindow.isAlwaysOnTop();
  }
  return false;
});

ipcMain.handle('window:isAlwaysOnTop', () => {
  return mainWindow ? mainWindow.isAlwaysOnTop() : false;
});

ipcMain.handle('system:getAppVersion', () => {
  return app.getVersion();
});

function activateAkariWindow(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.webContents.send('wake-word-triggered', data || { phrase: 'wake up akari' });
  }
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.focus();
    petWindow.webContents.send('wake-word-triggered', data || { phrase: 'wake up akari' });
  }
}

ipcMain.handle('window:activate', (event, data) => {
  activateAkariWindow(data);
  return true;
});

let petWindow = null;

function createPetWindow() {
  if (petWindow) {
    petWindow.show();
    petWindow.focus();
    return petWindow;
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  petWindow = new BrowserWindow({
    width: 320,
    height: 440,
    x: width - 340,
    y: height - 460,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });

  petWindow.loadURL(`${SERVER_URL}/?mode=pet`);
  petWindow.setAlwaysOnTop(true, 'screen-saver');

  petWindow.on('closed', () => {
    petWindow = null;
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.restore();
    }
  });

  return petWindow;
}

ipcMain.handle('window:setIgnoreMouseEvents', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
    return true;
  }
  return false;
});

ipcMain.handle('window:togglePetMode', (event, enable) => {
  if (enable) {
    createPetWindow();
    if (mainWindow) {
      mainWindow.minimize();
    }
    return true;
  } else {
    if (petWindow) {
      petWindow.close();
      petWindow = null;
    }
    if (mainWindow) {
      mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    return false;
  }
});

// App Lifecycle
app.whenReady().then(async () => {
  // Check if server is already running (e.g. started externally or in dev)
  const isRunning = await checkServerReady(SERVER_URL, 3, 200);
  if (!isRunning) {
    startBackendServer();
    await checkServerReady(SERVER_URL, 60, 300);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function cleanupProcesses() {
  if (isQuitting) return;
  isQuitting = true;

  if (backendProcess) {
    try {
      console.log('[Electron] Terminating child backend process...');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.warn('[Electron] Error killing backend process:', e);
    }
    backendProcess = null;
  }
}

app.on('before-quit', () => {
  cleanupProcesses();
});

app.on('window-all-closed', () => {
  cleanupProcesses();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('SIGINT', () => {
  cleanupProcesses();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupProcesses();
  process.exit(0);
});
