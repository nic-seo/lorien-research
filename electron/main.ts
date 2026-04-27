import { app, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
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
  // App is not code-signed with an Apple Developer cert; skip macOS signature check
  autoUpdater.verifyUpdateCodeSignature = false;

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
  const apifyKey = getKey('apify-api-token') || '';

  // Start the embedded Express server
  if (!isDev) {
    try {
      serverPort = await startServer({ anthropicKey, braveKey, apifyKey });
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

  // Register Ctrl+N as a global shortcut while the window is focused.
  // globalShortcut operates at the OS level and fires even when macOS or
  // Chromium would otherwise swallow the key before it reaches the renderer.
  mainWindow.on('focus', () => {
    if (!globalShortcut.isRegistered('Ctrl+N')) {
      globalShortcut.register('Ctrl+N', () => {
        mainWindow?.webContents.send('app-shortcut', 'new-session');
      });
    }
  });
  mainWindow.on('blur', () => {
    globalShortcut.unregister('Ctrl+N');
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
    apifyKey: getKey('apify-api-token') || '',
  };
});

ipcMain.handle('set-api-keys', async (_event, keys: { anthropicKey: string; braveKey?: string; apifyKey?: string }) => {
  if (keys.anthropicKey) {
    setKey('anthropic-api-key', keys.anthropicKey);
  }
  if (keys.braveKey) {
    setKey('brave-search-api-key', keys.braveKey);
  }
  if (keys.apifyKey !== undefined) {
    // Allow clearing by passing empty string
    if (keys.apifyKey) setKey('apify-api-token', keys.apifyKey);
  }

  // Hot-reload keys in the running server
  await updateServerKeys(
    keys.anthropicKey || getKey('anthropic-api-key') || '',
    keys.braveKey || getKey('brave-search-api-key') || '',
    keys.apifyKey !== undefined ? keys.apifyKey : getKey('apify-api-token') || '',
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

// --- Sessions file storage (persists across port/origin changes) ---

const sessionsPath = path.join(app.getPath('userData'), 'sessions.json');

ipcMain.handle('load-sessions', () => {
  try {
    if (!fs.existsSync(sessionsPath)) return '[]';
    return fs.readFileSync(sessionsPath, 'utf-8');
  } catch { return '[]'; }
});

ipcMain.handle('save-sessions', (_event, json: string) => {
  try { fs.writeFileSync(sessionsPath, json, 'utf-8'); } catch {}
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

// --- Silent PDF export (no print dialog) ---

ipcMain.handle('print-to-pdf', async (_event, { title, html }: { title: string; html: string }) => {
  const tmpPath = path.join(app.getPath('temp'), `lorien-print-${Date.now()}.html`);
  let win: BrowserWindow | null = null;
  try {
    fs.writeFileSync(tmpPath, html, 'utf-8');

    win = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(tmpPath);

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'none' },
    });

    // Sanitize filename: strip chars illegal on any major OS
    const safeName = title.replace(/[/\\:*?"<>|]/g, '').trim() || 'document';
    const outPath = path.join(app.getPath('downloads'), `${safeName}.pdf`);
    fs.writeFileSync(outPath, pdfBuffer);

    return { success: true, path: outPath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try { win?.close(); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

// --- App lifecycle ---

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  stopServer();
  app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
