import Database from 'better-sqlite3';
import type { ParsedSong } from './vvParser';

export interface SongSummary {
  id: number;
  name: string;
  category: string;
  font: string;
  stanzaCount: number;
}

export interface StanzaRow {
  index: number;
  lines: string[];
  plainText: string;
}

export interface SongDetail extends SongSummary {
  font2: string;
  tags: string;
  stanzas: StanzaRow[];
}

export class LyricsDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_key TEXT UNIQUE NOT NULL,
        source_file TEXT NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        font TEXT,
        font2 TEXT,
        tags TEXT,
        search_text TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stanzas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        stanza_index INTEGER NOT NULL,
        plain_text TEXT NOT NULL,
        lines_json TEXT NOT NULL,
        UNIQUE(song_id, stanza_index)
      );

      CREATE INDEX IF NOT EXISTS idx_songs_search ON songs(search_text);
      CREATE INDEX IF NOT EXISTS idx_songs_name ON songs(name);
      CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
    `);
  }

  importSongs(songs: ParsedSong[], sourceFile: string): number {
    const insertSong = this.db.prepare(`
      INSERT INTO songs (source_key, source_file, category, name, font, font2, tags, search_text)
      VALUES (@sourceKey, @sourceFile, @category, @name, @font, @font2, @tags, @searchText)
      ON CONFLICT(source_key) DO UPDATE SET
        source_file = excluded.source_file,
        category = excluded.category,
        name = excluded.name,
        font = excluded.font,
        font2 = excluded.font2,
        tags = excluded.tags,
        search_text = excluded.search_text
      RETURNING id
    `);

    const deleteStanzas = this.db.prepare('DELETE FROM stanzas WHERE song_id = ?');
    const insertStanza = this.db.prepare(`
      INSERT INTO stanzas (song_id, stanza_index, plain_text, lines_json)
      VALUES (?, ?, ?, ?)
    `);

    const tx = this.db.transaction((batch: ParsedSong[]) => {
      let count = 0;
      for (const song of batch) {
        const searchText = [
          song.name,
          song.category,
          song.tags,
          ...song.stanzas.map((s) => s.plainText),
        ]
          .join(' ')
          .toLowerCase();

        const row = insertSong.get({
          sourceKey: song.sourceKey,
          sourceFile,
          category: song.category,
          name: song.name,
          font: song.font,
          font2: song.font2,
          tags: song.tags,
          searchText,
        }) as { id: number };

        deleteStanzas.run(row.id);
        song.stanzas.forEach((stanza, index) => {
          insertStanza.run(row.id, index, stanza.plainText, JSON.stringify(stanza.lines));
        });
        count += 1;
      }
      return count;
    });

    return tx(songs);
  }

  searchSongs(query: string, limit = 80): SongSummary[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.db
        .prepare(
          `
          SELECT s.id, s.name, s.category, s.font,
                 (SELECT COUNT(*) FROM stanzas st WHERE st.song_id = s.id) AS stanzaCount
          FROM songs s
          ORDER BY s.name
          LIMIT ?
        `,
        )
        .all(limit) as SongSummary[];
    }

    return this.db
      .prepare(
        `
        SELECT s.id, s.name, s.category, s.font,
               (SELECT COUNT(*) FROM stanzas st WHERE st.song_id = s.id) AS stanzaCount
        FROM songs s
        WHERE lower(s.name) LIKE '%' || ? || '%'
        ORDER BY
          CASE WHEN lower(s.name) LIKE ? || '%' THEN 0 ELSE 1 END,
          s.name
        LIMIT ?
      `,
      )
      .all(q, q, limit) as SongSummary[];
  }

  getSongWithStanzas(id: number): SongDetail | null {
    const song = this.db
      .prepare(
        `
        SELECT s.id, s.name, s.category, s.font, s.font2, s.tags,
               (SELECT COUNT(*) FROM stanzas st WHERE st.song_id = s.id) AS stanzaCount
        FROM songs s
        WHERE s.id = ?
      `,
      )
      .get(id) as SongDetail | undefined;

    if (!song) return null;

    const stanzas = this.db
      .prepare(
        `
        SELECT stanza_index AS stanzaIndex, plain_text AS plainText, lines_json
        FROM stanzas
        WHERE song_id = ?
        ORDER BY stanza_index
      `,
      )
      .all(id) as Array<{ stanzaIndex: number; plainText: string; lines_json: string }>;

    return {
      ...song,
      stanzas: stanzas.map((s) => ({
        index: s.stanzaIndex,
        plainText: s.plainText,
        lines: JSON.parse(s.lines_json) as string[],
      })),
    };
  }

  stats(): { songs: number; stanzas: number } {
    const songs = (this.db.prepare('SELECT COUNT(*) AS c FROM songs').get() as { c: number }).c;
    const stanzas = (this.db.prepare('SELECT COUNT(*) AS c FROM stanzas').get() as { c: number }).c;
    return { songs, stanzas };
  }

  close(): void {
    this.db.close();
  }
}
