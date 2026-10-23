import { type Vec3, distance } from './geometry.js';
import { normaliseLabel } from './labels.js';

/** What we remember about where a spirit lived. */
export interface SpiritHome {
  label: string;
  dims: [number, number, number];
  position: Vec3;
}

export interface Candidate {
  id: string;
  label: string;
  dims: [number, number, number];
  position: Vec3;
}

export const DIM_TOLERANCE = 0.1;
export const POSITION_TOLERANCE_M = 0.3;

/** Same label, every dimension within ±10%, centre within 30 cm. */
export function matches(home: SpiritHome, c: Candidate): boolean {
  if (normaliseLabel(home.label) !== normaliseLabel(c.label)) return false;
  for (let i = 0; i < 3; i++) {
    const a = home.dims[i];
    const b = c.dims[i];
    if (a <= 0) return false;
    if (Math.abs(b - a) / a > DIM_TOLERANCE) return false;
  }
  return distance(home.position, c.position) <= POSITION_TOLERANCE_M;
}

/**
 * Re-finds a sleeping spirit's object after a reload when its anchor is gone. Returns the
 * closest matching candidate not already taken, or null (the spirit stays asleep and its
 * card says "Not found in this room").
 */
export function rematch(home: SpiritHome, candidates: Candidate[], taken: Set<string> = new Set()): Candidate | null {
  let best: Candidate | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    if (taken.has(c.id) || !matches(home, c)) continue;
    const d = distance(home.position, c.position);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Assign every saved spirit to at most one object, nearest pairs first. */
export function rematchAll<T extends SpiritHome & { spiritId: string }>(
  homes: T[],
  candidates: Candidate[],
): Map<string, Candidate> {
  const pairs: { s: T; c: Candidate; d: number }[] = [];
  for (const s of homes) for (const c of candidates) if (matches(s, c)) pairs.push({ s, c, d: distance(s.position, c.position) });
  pairs.sort((a, b) => a.d - b.d);
  const out = new Map<string, Candidate>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.s.spiritId) || used.has(p.c.id)) continue;
    out.set(p.s.spiritId, p.c);
    used.add(p.c.id);
  }
  return out;
}
