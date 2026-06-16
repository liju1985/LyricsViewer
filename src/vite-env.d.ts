/// <reference types="vite/client" />

import type { LyricsViewerApi } from '../electron/preload';

declare global {
  interface Window {
    lyricsViewer: LyricsViewerApi;
  }
}

export {};
