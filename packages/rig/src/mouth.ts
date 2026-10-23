import type { MouthShape } from './shapes.js';

/**
 * Audio path (MMS-TTS WAV played through an AnalyserNode): RMS energy 0..1 and the spectral
 * centroid as a fraction of Nyquist pick one of the five mouth shapes.
 */
export function envelopeToMouth(energy: number, centroid: number): MouthShape {
  if (energy < 0.06) return 'rest';
  if (energy < 0.12) return 'M';
  if (centroid > 0.22) return 'E';
  if (centroid < 0.09 && energy < 0.45) return 'O';
  return 'A';
}

export interface MouthKey {
  t: number; // seconds from the start of the line
  shape: MouthShape;
}

const VOWEL_SHAPE: Record<string, MouthShape> = { a: 'A', e: 'E', i: 'E', o: 'O', u: 'O', y: 'E' };
const CLOSED = new Set(['m', 'b', 'p']);

/**
 * Text-timing path, used for the Web Speech fallback (no audio stream, only `boundary`
 * events) and when no voice is available at all: each word gets mouth keys from its
 * letters, spread over the word's time slot. Coarser than the audio path; the UI says so.
 */
export function wordMouthKeys(word: string, start: number, duration: number): MouthKey[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return [{ t: start, shape: 'rest' }];
  const keys: MouthKey[] = [];
  const syllables: MouthShape[] = [];
  let prevVowel = false;
  for (const ch of letters) {
    const v = VOWEL_SHAPE[ch];
    if (v) {
      if (!prevVowel) syllables.push(v);
      prevVowel = true;
    } else {
      if (CLOSED.has(ch)) syllables.push('M');
      prevVowel = false;
    }
  }
  if (syllables.length === 0) syllables.push('E');
  const step = duration / syllables.length;
  syllables.forEach((s, i) => keys.push({ t: start + i * step, shape: s }));
  keys.push({ t: start + duration * 0.92, shape: 'rest' });
  return keys;
}

/** Seconds a line takes at `wpm` words per minute (punctuation adds pauses). */
export function lineTimeline(text: string, wpm = 165): { keys: MouthKey[]; duration: number; words: { word: string; t: number }[] } {
  const perWord = 60 / wpm;
  const keys: MouthKey[] = [];
  const words: { word: string; t: number }[] = [];
  let t = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const len = Math.max(0.5, Math.min(2.2, token.replace(/[^a-z]/gi, '').length / 5));
    const d = perWord * len;
    words.push({ word: token, t });
    keys.push(...wordMouthKeys(token, t, d));
    t += d;
    if (/[.!?]$/.test(token)) t += 0.35;
    else if (/[,;:]$/.test(token)) t += 0.15;
  }
  keys.push({ t, shape: 'rest' });
  return { keys, duration: t, words };
}

/** The shape active at time t (keys sorted by t). */
export function shapeAt(keys: MouthKey[], t: number): MouthShape {
  let s: MouthShape = 'rest';
  for (const k of keys) {
    if (k.t > t) break;
    s = k.shape;
  }
  return s;
}

/**
 * Lip-sync offset metric: for each audio energy onset, the delay until the mouth is open.
 * Inputs are per-frame series sampled at `fps`. Returns offsets in ms.
 */
export function lipSyncOffsets(energy: number[], mouthOpen: number[], fps: number, onset = 0.12, open = 0.2): number[] {
  const out: number[] = [];
  for (let i = 1; i < energy.length; i++) {
    if (energy[i - 1] < onset && energy[i] >= onset) {
      for (let j = i; j < Math.min(mouthOpen.length, i + fps); j++) {
        if (mouthOpen[j] >= open) {
          out.push(((j - i) / fps) * 1000);
          break;
        }
      }
    }
  }
  return out;
}
