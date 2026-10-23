import { describe, expect, it } from 'vitest';
import { GestureTracker, type Vec3, classifyStroke } from '../src/index.js';

const face = { center: [0, 1, -1] as Vec3, normal: [0, 0, 1] as Vec3, radius: 0.1 };

function run(tr: GestureTracker, samples: [number, Vec3, Vec3 | null][]) {
  const out: string[] = [];
  for (const [t, tip, palm] of samples) {
    const g = tr.update(t, tip, palm);
    if (g) out.push(g);
  }
  return out;
}

describe('GestureTracker (hands)', () => {
  it('detects a poke: fingertip pushes into the face', () => {
    const tr = new GestureTracker(face);
    const s: [number, Vec3, Vec3 | null][] = [];
    for (let i = 0; i <= 10; i++) s.push([i / 72, [0.01, 1, -1 + 0.1 - i * 0.01], null]); // 0.72 m/s inward
    expect(run(tr, s)).toEqual(['poke']);
  });
  it('does not poke when the finger slides in from the side slowly', () => {
    const tr = new GestureTracker(face);
    const s: [number, Vec3, Vec3 | null][] = [];
    for (let i = 0; i <= 60; i++) s.push([i / 72, [-0.3 + i * 0.002, 1, -1 + 0.012], null]);
    expect(run(tr, s)).not.toContain('poke');
  });
  it('detects a flick: fast sideways pass over the face', () => {
    const tr = new GestureTracker(face);
    const s: [number, Vec3, Vec3 | null][] = [];
    for (let i = 0; i <= 8; i++) s.push([i / 72, [-0.12 + i * 0.03, 1, -1 + 0.03], null]); // 2.16 m/s
    expect(run(tr, s)).toEqual(['flick']);
  });
  it('detects a pet: slow back-and-forth stroke by the palm, then cools down', () => {
    const tr = new GestureTracker(face);
    const s: [number, Vec3, Vec3 | null][] = [];
    for (let i = 0; i <= 144; i++) {
      const t = i / 72;
      const x = 0.08 * Math.sin(t * Math.PI * 1.5);
      s.push([t, [x, 1.05, -1 + 0.06], [x, 1.0, -1 + 0.05]]);
    }
    const out = run(tr, s);
    expect(out[0]).toBe('pet');
    expect(out.length).toBeLessThanOrEqual(2); // cooldown 1.2 s over 2 s
  });
  it('reports near for gaze and resets when tracking is lost', () => {
    const tr = new GestureTracker(face);
    tr.update(0, [0, 1, -0.8], null);
    expect(tr.near).toBe(true);
    tr.update(0.1, null, null);
    expect(tr.near).toBe(false);
  });
});

describe('classifyStroke (browser)', () => {
  it('tap = poke', () => expect(classifyStroke([{ t: 0, x: 0, y: 0 }, { t: 0.12, x: 0.05, y: 0 }])).toBe('poke'));
  it('quick swipe = flick', () =>
    expect(classifyStroke([{ t: 0, x: -0.8, y: 0 }, { t: 0.05, x: 0, y: 0 }, { t: 0.1, x: 0.8, y: 0 }])).toBe('flick'));
  it('slow rub = pet', () => {
    const s = [];
    for (let i = 0; i <= 30; i++) s.push({ t: i * 0.033, x: 0.5 * Math.sin(i * 0.5), y: 0 });
    expect(classifyStroke(s)).toBe('pet');
  });
  it('a slow single drag is nothing', () =>
    expect(classifyStroke([{ t: 0, x: 0, y: 0 }, { t: 0.6, x: 0.6, y: 0 }])).toBeNull());
});
