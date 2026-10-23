import { describe, expect, it } from 'vitest';
import {
  BLINK,
  Blinker,
  EXPRESSIONS,
  FaceRig,
  MOUTHS,
  envelopeToMouth,
  lineTimeline,
  lipSyncOffsets,
  mulberry32,
  shapeAt,
  wordMouthKeys,
} from '../src/index.js';

const step = (rig: FaceRig, seconds: number, fps = 72) => {
  for (let i = 0; i < Math.round(seconds * fps); i++) rig.update(1 / fps);
  return rig.params;
};

describe('mouth shapes', () => {
  it('maps the audio envelope to all five shapes', () => {
    expect(envelopeToMouth(0.01, 0.1)).toBe('rest');
    expect(envelopeToMouth(0.1, 0.1)).toBe('M');
    expect(envelopeToMouth(0.5, 0.3)).toBe('E');
    expect(envelopeToMouth(0.3, 0.05)).toBe('O');
    expect(envelopeToMouth(0.6, 0.15)).toBe('A');
  });
  it('turns a word into syllable keys that end at rest', () => {
    const k = wordMouthKeys('banana', 0, 0.6);
    expect(k.map((x) => x.shape)).toEqual(['M', 'A', 'A', 'A', 'rest']);
    expect(k[k.length - 1].t).toBeCloseTo(0.552, 6);
  });
  it('times a line with pauses at punctuation', () => {
    const a = lineTimeline('hello there');
    const b = lineTimeline('hello. there');
    expect(b.duration - a.duration).toBeCloseTo(0.35, 6);
    expect(a.words.map((w) => w.word)).toEqual(['hello', 'there']);
    expect(shapeAt(a.keys, a.duration + 1)).toBe('rest');
  });
  it('measures lip-sync offsets from per-frame series', () => {
    const energy = [0, 0, 0.5, 0.5, 0.5, 0, 0, 0.5, 0.5];
    const open = [0, 0, 0, 0.4, 0.4, 0, 0, 0.3, 0.3];
    expect(lipSyncOffsets(energy, open, 100)).toEqual([10, 0]);
  });
  it('lists exactly five expressions and five mouths', () => {
    expect(EXPRESSIONS.length).toBe(5);
    expect(MOUTHS.length).toBe(5);
  });
});

describe('blinks', () => {
  it('blinks within the gap bounds and closes the eyes fully', () => {
    const b = new Blinker(mulberry32(7));
    let closedAt: number[] = [];
    let wasClosed = false;
    for (let i = 0; i < 72 * 30; i++) {
      const t = i / 72;
      const v = b.sample(t);
      const closed = v < 0.2;
      if (closed && !wasClosed) closedAt.push(t);
      wasClosed = closed;
    }
    expect(closedAt.length).toBeGreaterThanOrEqual(5);
    expect(closedAt.length).toBeLessThanOrEqual(30 / BLINK.minGap * 2 + 2);
    const gaps = closedAt.slice(1).map((t, i) => t - closedAt[i]);
    for (const g of gaps) expect(g).toBeLessThanOrEqual(BLINK.maxGap + BLINK.duration + 0.05);
  });
  it('is deterministic for a seed', () => {
    const a = new Blinker(mulberry32(3));
    const b = new Blinker(mulberry32(3));
    for (let i = 0; i < 500; i++) expect(a.sample(i / 72)).toBe(b.sample(i / 72));
  });
});

describe('FaceRig', () => {
  it('is asleep (eyes shut, hidden) until woken, then blooms in', () => {
    const rig = new FaceRig(1);
    let p = step(rig, 0.5);
    expect(p.reveal).toBe(0);
    expect(p.eyeOpen).toBeLessThan(0.1);
    rig.react('wake');
    p = step(rig, 1.5);
    expect(p.reveal).toBeGreaterThan(0.99);
    rig.lookAt(0, 0);
    p = step(rig, 0.5);
    expect(p.eyeOpen).toBeGreaterThan(0.5);
  });
  it('switches expression on reactions and returns to the base', () => {
    const rig = new FaceRig(2);
    rig.react('wake');
    step(rig, 1);
    rig.react('poke');
    expect(rig.expression).toBe('surprised');
    step(rig, 1.0);
    expect(rig.expression).toBe('neutral');
    rig.react('pet');
    step(rig, 0.3);
    expect(rig.expression).toBe('happy');
    expect(rig.params.eyeSmile).toBeGreaterThan(0.5);
    rig.setExpression('grumpy');
    step(rig, 2);
    expect(rig.expression).toBe('grumpy');
  });
  it('squashes on a poke and wobbles on a flick, then settles', () => {
    const rig = new FaceRig(3);
    rig.react('wake');
    step(rig, 2);
    rig.react('poke');
    let minSq = 0;
    for (let i = 0; i < 20; i++) minSq = Math.min(minSq, rig.update(1 / 72).squash);
    expect(minSq).toBeLessThan(-0.05);
    rig.react('flick');
    let maxW = 0;
    for (let i = 0; i < 30; i++) maxW = Math.max(maxW, Math.abs(rig.update(1 / 72).wobble));
    expect(maxW).toBeGreaterThan(0.1);
    step(rig, 4);
    expect(Math.abs(rig.params.squash)).toBeLessThan(0.01);
    expect(Math.abs(rig.params.wobble)).toBeLessThan(0.01);
  });
  it('follows a speech timeline and closes the mouth after', () => {
    const rig = new FaceRig(4);
    rig.react('wake');
    step(rig, 1);
    const line = lineTimeline('Mama, I am awake.');
    rig.speak(line.keys, line.duration);
    let maxOpen = 0;
    for (let i = 0; i < Math.round(line.duration * 72); i++) maxOpen = Math.max(maxOpen, rig.update(1 / 72).mouthOpen);
    expect(maxOpen).toBeGreaterThan(0.5);
    step(rig, 0.5);
    expect(rig.speaking).toBe(false);
    expect(rig.params.mouthOpen).toBeLessThan(0.05);
  });
  it('mouth reaches an audio shape within 80 ms (lip-sync budget)', () => {
    const rig = new FaceRig(5);
    rig.react('wake');
    step(rig, 1);
    rig.setEnvelopeShape('A');
    let ms = 0;
    while (rig.params.mouthOpen < 0.2 && ms < 500) {
      rig.update(1 / 72);
      ms += 1000 / 72;
    }
    expect(ms).toBeLessThanOrEqual(80);
  });
  it('looks at a target, clamps it, and looks up while thinking', () => {
    const rig = new FaceRig(6);
    rig.react('wake');
    rig.lookAt(3, 0);
    step(rig, 1);
    expect(rig.params.lookX).toBeCloseTo(1, 2);
    rig.react('think');
    step(rig, 1);
    expect(rig.params.lookY).toBeGreaterThan(0.6);
    rig.setEnvelopeShape('A');
    expect(rig.thinking).toBe(false);
  });
  it('fades out on sleep', () => {
    const rig = new FaceRig(7);
    rig.react('wake');
    step(rig, 1.5);
    rig.react('sleep');
    step(rig, 4);
    expect(rig.params.reveal).toBe(0);
    expect(rig.awake).toBe(false);
  });
});
