import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { getKey, setKey, hasKeys } from './key-store.js';
import { startServer, updateServerKeys, stopServer } from './server-bridge.js';

let mainWindow: BrowserWindow | null = null;
let serverPort: number | null = null;
let serverError: string | null = null;

const isDev = !app.isPackaged;

// --- Auto-updater setup ---

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: v${info.version}`);
    mainWindow?.webContents.send('updater-event', { type: 'update-available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[updater] Downloading: ${percent}%`);
    mainWindow?.webContents.send('updater-event', { type: 'download-progress', percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: v${info.version}`);
    mainWindow?.webContents.send('updater-event', { type: 'update-downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
    mainWindow?.webContents.send('updater-event', { type: 'error', message: err.message });
  });

  autoUpdater.checkForUpdatesAndNotify();
}

// --- Window creation ---

async function createWindow() {
  // Read stored keys
  const anthropicKey = getKey('anthropic-api-key') || '';
  const braveKey = getKey('brave-search-api-key') || '';

  // Start the embedded Express server
  if (!isDev) {
    try {
      serverPort = await startServer({ anthropicKey, braveKey });
      console.log(`[electron] Server started on port ${serverPort}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err);
      console.error('[electron] Failed to start server:', msg);
      serverError = msg;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, load Vite dev server; in prod, load from embedded Express
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else if (serverPort) {
    mainWindow.loadURL(`http://localhost:${serverPort}`);
  } else {
    // Server failed to start — show the actual error
    const errHtml = (serverError || 'Unknown error').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html><body style="font-family:monospace;padding:40px;background:#1a1a1a;color:#e0e0e0">
        <h2>Failed to start Lorien Research</h2>
        <p style="color:#f0b8c8;white-space:pre-wrap">${errHtml}</p>
        <p style="margin-top:24px;color:#888">Try restarting the app. If the issue persists, reinstall from the DMG.</p>
      </body></html>
    `)}`);
  }

  // Open DevTools in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates after window is ready (production only)
  if (!isDev) {
    setupAutoUpdater();
  }
}

// --- IPC Handlers ---

ipcMain.handle('get-api-keys', () => {
  return {
    anthropicKey: getKey('anthropic-api-key') || '',
    braveKey: getKey('brave-search-api-key') || '',
  };
});

ipcMain.handle('set-api-keys', async (_event, keys: { anthropicKey: string; braveKey?: string }) => {
  if (keys.anthropicKey) {
    setKey('anthropic-api-key', keys.anthropicKey);
  }
  if (keys.braveKey) {
    setKey('brave-search-api-key', keys.braveKey);
  }

  // Hot-reload keys in the running server
  await updateServerKeys(
    keys.anthropicKey || getKey('anthropic-api-key') || '',
    keys.braveKey || getKey('brave-search-api-key') || ''
  );
});

ipcMain.handle('has-api-keys', () => {
  return hasKeys();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates', async () => {
  if (isDev) return { status: 'dev' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: 'checked', version: result?.updateInfo?.version };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
  }
});

// --- App lifecycle ---

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
