import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  session,
  systemPreferences,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import { LyricsDatabase } from './database';
import { importVerseViewXml } from './vvParser';
import { SpeechService } from './speechService';
const isDev = !app.isPackaged;

let controlWindow: BrowserWindow | null = null;
let presentationWindow: BrowserWindow | null = null;
let db: LyricsDatabase | null = null;
let lastPresentationPayload: PresentationPayload | null = null;
const speechService = new SpeechService();

function getDb(): LyricsDatabase {
  if (!db) {
    db = new LyricsDatabase(path.join(app.getPath('userData'), 'library.db'));
  }
  return db;
}

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'LyricsViewer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    controlWindow.loadURL('http://localhost:5173');
    controlWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    controlWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  controlWindow.on('closed', () => {
    controlWindow = null;
    presentationWindow?.close();
  });
}

function getExternalDisplay(): Electron.Display | undefined {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.find((d) => d.id !== primary.id);
}

function createPresentationWindow(): BrowserWindow {
  const external = getExternalDisplay();
  const bounds = external?.bounds ?? screen.getPrimaryDisplay().bounds;

  presentationWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: Boolean(external),
    frame: !external,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    presentationWindow.loadURL('http://localhost:5173/presentation.html');
  } else {
    presentationWindow.loadFile(path.join(__dirname, '../dist/presentation.html'));
  }

  presentationWindow.webContents.on('did-finish-load', () => {
    if (lastPresentationPayload) {
      presentationWindow?.webContents.send('presentation:update', lastPresentationPayload);
    }
  });

  presentationWindow.once('ready-to-show', () => {
    presentationWindow?.show();
  });

  presentationWindow.on('closed', () => {
    presentationWindow = null;
  });

  return presentationWindow;
}

function ensurePresentationWindow(): BrowserWindow {
  if (!presentationWindow || presentationWindow.isDestroyed()) {
    return createPresentationWindow();
  }
  return presentationWindow;
}

function registerIpc(): void {
  ipcMain.handle('library:import-xml', async (_event: IpcMainInvokeEvent) => {
    const result = await dialog.showOpenDialog(controlWindow!, {
      title: 'Import VerseVIEW XML',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'VerseVIEW XML', extensions: ['xml'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, files: [] as string[] };
    }

    const database = getDb();
    let imported = 0;
    for (const filePath of result.filePaths) {
      const songs = importVerseViewXml(filePath);
      imported += database.importSongs(songs, filePath);
    }

    return { imported, files: result.filePaths };
  });

  ipcMain.handle('library:import-folder', async () => {
    const result = await dialog.showOpenDialog(controlWindow!, {
      title: 'Import VerseVIEW XML folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { imported: 0, files: [] as string[] };
    }

    const fs = await import('node:fs');
    const dir = result.filePaths[0];
    const xmlFiles = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xml'));
    const database = getDb();
    let imported = 0;
    const files: string[] = [];

    for (const file of xmlFiles) {
      const filePath = path.join(dir, file);
      const songs = importVerseViewXml(filePath);
      imported += database.importSongs(songs, filePath);
      files.push(filePath);
    }

    return { imported, files };
  });

  ipcMain.handle('library:search', (_event, query: string) => {
    return getDb().searchSongs(query);
  });

  ipcMain.handle('library:get-song', (_event, id: number) => {
    return getDb().getSongWithStanzas(id);
  });

  ipcMain.handle('library:stats', () => {
    return getDb().stats();
  });

  ipcMain.handle('presentation:open', () => {
    ensurePresentationWindow();
    return true;
  });

  ipcMain.handle('presentation:show-stanza', (_event, payload: PresentationPayload) => {
    lastPresentationPayload = payload;
    const win = ensurePresentationWindow();
    if (!win.webContents.isLoading()) {
      win.webContents.send('presentation:update', payload);
    }
    return true;
  });

  ipcMain.handle('presentation:close', () => {
    if (presentationWindow && !presentationWindow.isDestroyed()) {
      if (presentationWindow.isFullScreen()) {
        presentationWindow.setFullScreen(false);
      }
      presentationWindow.close();
    }
    return true;
  });

  ipcMain.handle('displays:list', () => {
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label,
      bounds: d.bounds,
      isPrimary: d.id === screen.getPrimaryDisplay().id,
    }));
  });

  ipcMain.handle('speech:request-mic', async () => {
    if (process.platform === 'darwin') {
      const access = await systemPreferences.askForMediaAccess('microphone');
      return access;
    }
    return true;
  });

  ipcMain.handle('speech:ensure-model', async (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    await speechService.ensureModel((message) => {
      sender?.webContents.send('speech:status', message);
    });
    return true;
  });

  ipcMain.handle('speech:start', (event, grammar: string[]) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    speechService.start(grammar, (text, isFinal) => {
      sender?.webContents.send('speech:transcript', { text, final: isFinal });
    });
    return true;
  });

  ipcMain.handle('speech:stop', () => {
    speechService.stop();
    return true;
  });

  ipcMain.on('speech:audio-chunk', (_event, payload: ArrayBuffer | Uint8Array) => {
    const chunk = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(payload instanceof ArrayBuffer ? payload : payload.buffer);
    speechService.processChunk(chunk);
  });
}

export interface PresentationPayload {
  songTitle: string;
  category: string;
  stanzaIndex: number;
  totalStanzas: number;
  lines: string[];
  font?: string;
  listening?: boolean;
}

app.whenReady().then(() => {
  speechService.setUserDataPath(app.getPath('userData'));

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  registerIpc();
  createControlWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
    }
  });
});

app.on('window-all-closed', () => {
  speechService.dispose();
  db?.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
