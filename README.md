# LyricsViewer

Choir-aware lyrics presentation for extended displays. Imports VerseVIEW XML, lets you pick a song and starting stanza, then listens to the choir and advances slides automatically.

## Storage model

- **XML stays the source of truth** — export from VerseVIEW and import into LyricsViewer.
- **SQLite cache** — fast search across hundreds of songs; stanzas are pre-parsed at import time.
- Your `vvexport` folder (~790 songs, ~1 MB) imports in a few seconds.

## Quick start

```bash
npm install
npm run electron:dev
```

On first launch:

1. Click **Import Folder** and choose `/Users/liju1985/Desktop/vvexport`
2. Search and select a song
3. Click the stanza where the choir will start
4. Click **Listen & Display** — presentation opens on the extended display

## Manual controls

- **Display Stanza** — show current stanza without listening
- **Prev / Next** — move manually
- **Open Display** — open the presentation window on the external monitor

## Listen sync (v0.1)

Uses the browser speech recognition API (Chromium). Works best for clear English vocals. Malayalam and mixed-language songs may need a future Whisper-based backend.

## Scripts

- `npm run electron:dev` — development
- `npm run build` — production build
- `npm run electron:build` — packaged macOS app
