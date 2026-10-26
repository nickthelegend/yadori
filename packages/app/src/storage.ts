/**
 * Spirits saved in this browser (built-in faces and puppet spirits; with a key the gateway
 * also keeps persona and memory). Used to re-find spirits after a reload: by anchor in a
 * headset, and by label + size (±10%) + position (≤ 30 cm) everywhere (@yadori/room).
 * Wrapped in try/catch: private windows can refuse storage, and the app still works.
 */
import type { Persona, Sheet } from './gateway.js';

export interface SavedSpirit {
  spiritId: string;
  label: string;
  name: string;
  dims: [number, number, number];
  position: [number, number, number];
  persona: Persona | null;
  sheet: Sheet | null;
  faceSource: 'built-in' | 'sheet';
  source: 'label' | 'camera';
  firstWoke: string;
  lines: number;
  memories: number;
  room: string;
}

const KEY = 'yadori.spirits.v1';

function readAll(): SavedSpirit[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((s) => s !== null && typeof s === 'object') : [];
  } catch {
    return [];
  }
}

export function loadSpirits(room: string): SavedSpirit[] {
  return readAll().filter((s) => s.room === room);
}

function writeAll(list: SavedSpirit[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: spirits last for this session only */
  }
}

export function saveSpirit(s: SavedSpirit): void {
  const all = readAll();
  const i = all.findIndex((x) => x.spiritId === s.spiritId);
  if (i >= 0) all[i] = s;
  else all.push(s);
  writeAll(all);
}

export function deleteSpirit(spiritId: string): void {
  try {
    const all = readAll().filter((x) => x.spiritId !== spiritId);
    writeAll(all);
  } catch {
    /* nothing to delete */
  }
}
