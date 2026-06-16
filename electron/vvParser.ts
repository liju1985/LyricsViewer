import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

export interface ParsedSong {
  category: string;
  name: string;
  font: string;
  font2: string;
  tags: string;
  stanzas: ParsedStanza[];
  sourceKey: string;
}

export interface ParsedStanza {
  lines: string[];
  plainText: string;
}

interface RawSong {
  category?: string;
  name?: string;
  font?: string;
  font2?: string;
  tags?: string | { '#cdata-section'?: string };
  slide?: string | { '#cdata-section'?: string };
}

function cdata(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#cdata-section' in value) {
    return String((value as { '#cdata-section': string })['#cdata-section'] ?? '');
  }
  return '';
}

function decodeSlideHtml(text: string): string {
  return text
    .replace(/<BR>/gi, '\n')
    .replace(/<br>/gi, '\n')
    .replace(/<slide>/gi, '\n---STANZA---\n')
    .replace(/<slide>/gi, '')
    .trim();
}

export function parseSlideContent(slideRaw: string): ParsedStanza[] {
  const decoded = decodeSlideHtml(slideRaw);
  const parts = decoded
    .split('---STANZA---')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '<slide>');

  return parts.map((part) => {
    const lines = part
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const plainText = lines.join(' ').replace(/\(x\d+\)/gi, '').trim();
    return { lines, plainText };
  });
}

function makeSourceKey(category: string, name: string, slideRaw: string): string {
  return `${category}::${name}::${slideRaw.slice(0, 120)}`;
}

export function importVerseViewXml(filePath: string): ParsedSong[] {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: '#cdata-section',
    trimValues: true,
  });

  const doc = parser.parse(xml) as { songDB?: { song?: RawSong | RawSong[] } };
  const rawSongs = doc.songDB?.song;
  if (!rawSongs) return [];

  const list = Array.isArray(rawSongs) ? rawSongs : [rawSongs];
  const results: ParsedSong[] = [];

  for (const raw of list) {
    const name = (raw.name ?? '').trim();
    const category = (raw.category ?? '').trim();
    const slideRaw = cdata(raw.slide);
    const stanzas = parseSlideContent(slideRaw);

    if (!name || stanzas.length === 0) continue;

    results.push({
      category,
      name,
      font: (raw.font ?? 'Arial').trim(),
      font2: (raw.font2 ?? 'Arial').trim(),
      tags: cdata(raw.tags),
      stanzas,
      sourceKey: makeSourceKey(category, name, slideRaw),
    });
  }

  return results;
}
