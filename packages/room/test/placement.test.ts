import { describe, expect, it } from 'vitest';
import {
  FACE_MAX_M,
  FACE_MIN_M,
  type OBB,
  chooseFace,
  placeFace,
  quatFromAxisAngle,
  turnAngleDeg,
  turnToward,
} from '../src/index.js';

const id: [number, number, number, number] = [0, 0, 0, 1];
const couch: OBB = { center: [0, 0.43, -2.5], quat: id, half: [1, 0.43, 0.47] };

describe('face placement', () => {
  it('uses the side facing the viewer for each of the four sides', () => {
    const cases: [[number, number, number], number][] = [
      [[0, 1.6, 0], 4], // viewer in front (+z)
      [[0, 1.6, -6], 5], // behind
      [[5, 1.6, -2.5], 0], // +x
      [[-5, 1.6, -2.5], 1], // -x
    ];
    for (const [viewer, index] of cases) expect(chooseFace(couch, viewer).index).toBe(index);
  });
  it('never puts the face on the top or bottom, even when looking straight down', () => {
    const f = chooseFace(couch, [0, 5, -2.5]);
    expect([2, 3]).not.toContain(f.index);
  });
  it('sits in the upper third, 1 cm proud, 35% of the smaller side', () => {
    const p = placeFace(couch, [0, 1.6, 0]);
    // front face: 2.0 wide x 0.86 tall -> 0.35 * 0.86 = 0.301 m
    expect(p.size).toBeCloseTo(0.301, 3);
    expect(p.position[2]).toBeCloseTo(-2.5 + 0.47 + 0.01, 6);
    // upper third: centre + 2/3 of the half height, but kept inside: 0.43 - 0.1505
    expect(p.position[1]).toBeCloseTo(0.43 + Math.min(0.43 * (2 / 3), 0.43 - 0.301 / 2), 6);
    expect(p.position[1] + p.size / 2).toBeLessThanOrEqual(0.86 + 1e-9);
    expect(p.normal).toEqual([0, 0, 1]);
  });
  it('clamps to 12 cm for small objects (but never wider than the surface)', () => {
    const lampShade: OBB = { center: [0, 1.2, -2], quat: id, half: [0.2, 0.15, 0.2] };
    expect(placeFace(lampShade, [0, 1.6, 0]).size).toBeCloseTo(FACE_MIN_M, 6);
    const thin: OBB = { center: [0, 1, -2], quat: id, half: [0.04, 0.5, 0.3] };
    // side facing +x viewer is 0.6 wide; facing +z viewer is 0.08 wide -> capped at 0.08
    expect(placeFace(thin, [0, 1.6, 0]).size).toBeCloseTo(0.08, 6);
  });
  it('clamps to 40 cm for big objects', () => {
    const bed: OBB = { center: [0, 0.5, -3], quat: id, half: [1.5, 0.5, 1.2] };
    expect(placeFace(bed, [0, 1.6, 0]).size).toBeLessThanOrEqual(FACE_MAX_M);
    const wardrobe: OBB = { center: [0, 1, -3], quat: id, half: [1.5, 1, 0.3] };
    expect(placeFace(wardrobe, [0, 1.6, 0]).size).toBe(FACE_MAX_M);
  });
  it('works on a yawed box', () => {
    const q = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
    const box: OBB = { center: [0, 0.5, -2], quat: q, half: [1, 0.5, 0.3] };
    const p = placeFace(box, [0, 1.6, 0]);
    expect(p.normal[2]).toBeCloseTo(1, 6);
  });
});

describe('turnToward', () => {
  it('turns fully toward a viewer within 40°', () => {
    const d = turnToward([0, 0, 1], [0, 1, 0], [0, 0.5, 0], [Math.tan((20 * Math.PI) / 180), 0.5, 1]);
    expect(turnAngleDeg([0, 0, 1], d)).toBeCloseTo(20, 4);
    expect(d[0]).toBeGreaterThan(0);
  });
  it('stops at 40° for a viewer far to the side', () => {
    const d = turnToward([0, 0, 1], [0, 1, 0], [0, 0.5, 0], [5, 0.5, 0.2]);
    expect(turnAngleDeg([0, 0, 1], d)).toBeCloseTo(40, 4);
    const d2 = turnToward([0, 0, 1], [0, 1, 0], [0, 0.5, 0], [-5, 0.5, 0.2]);
    expect(d2[0]).toBeLessThan(0);
  });
  it('ignores the viewer height (turns only around up)', () => {
    const d = turnToward([0, 0, 1], [0, 1, 0], [0, 0.5, 0], [0, 3, 1]);
    expect(d[1]).toBeCloseTo(0, 6);
  });
});
