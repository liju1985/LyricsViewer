import { contextBridge, ipcRenderer } from 'electron';
import type { PresentationPayload } from './main';

export interface SongSummary {
  id: number;
  name: string;
  category: string;
  font: string;
  stanzaCount: number;
}

export interface Stanza {
  index: number;
  lines: string[];
  plainText: string;
}

export interface SongDetail extends SongSummary {
  font2: string;
  tags: string;
  stanzas: Stanza[];
}

const api = {
  importXml: () => ipcRenderer.invoke('library:import-xml') as Promise<{ imported: number; files: string[] }>,
  importFolder: () => ipcRenderer.invoke('library:import-folder') as Promise<{ imported: number; files: string[] }>,
  searchSongs: (query: string) => ipcRenderer.invoke('library:search', query) as Promise<SongSummary[]>,
  getSong: (id: number) => ipcRenderer.invoke('library:get-song', id) as Promise<SongDetail | null>,
  libraryStats: () => ipcRenderer.invoke('library:stats') as Promise<{ songs: number; stanzas: number }>,
  openPresentation: () => ipcRenderer.invoke('presentation:open') as Promise<boolean>,
  showStanza: (payload: PresentationPayload) =>
    ipcRenderer.invoke('presentation:show-stanza', payload) as Promise<boolean>,
  closePresentation: () => ipcRenderer.invoke('presentation:close') as Promise<boolean>,
  listDisplays: () =>
    ipcRenderer.invoke('displays:list') as Promise<
      Array<{ id: number; label: string; bounds: Electron.Rectangle; isPrimary: boolean }>
    >,
  onPresentationUpdate: (handler: (payload: PresentationPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: PresentationPayload) => handler(payload);
    ipcRenderer.on('presentation:update', listener);
    return () => {
      ipcRenderer.removeListener('presentation:update', listener);
    };
  },
  requestMicrophone: () => ipcRenderer.invoke('speech:request-mic') as Promise<boolean>,
  ensureSpeechModel: () => ipcRenderer.invoke('speech:ensure-model') as Promise<boolean>,
  startSpeech: (grammar: string[]) => ipcRenderer.invoke('speech:start', grammar) as Promise<boolean>,
  stopSpeech: () => ipcRenderer.invoke('speech:stop') as Promise<boolean>,
  sendAudioChunk: (chunk: Int16Array) => {
    const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    ipcRenderer.send('speech:audio-chunk', bytes);
  },
  onSpeechTranscript: (handler: (payload: { text: string; final: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { text: string; final: boolean }) =>
      handler(payload);
    ipcRenderer.on('speech:transcript', listener);
    return () => {
      ipcRenderer.removeListener('speech:transcript', listener);
    };
  },
  onSpeechStatus: (handler: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => handler(message);
    ipcRenderer.on('speech:status', listener);
    return () => {
      ipcRenderer.removeListener('speech:status', listener);
    };
  },
};

contextBridge.exposeInMainWorld('lyricsViewer', api);

export type LyricsViewerApi = typeof api;
