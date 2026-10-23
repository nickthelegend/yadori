import { describe, expect, it } from 'vitest';
import { type OBB, obbDims, obbFaces, obbFromMinMax, pointInObb, quatFromAxisAngle, rayObb, rotate } from '../src/index.js';

const id: [number, number, number, number] = [0, 0, 0, 1];
const couch: OBB = { center: [0, 0.43, -2.5], quat: id, half: [1, 0.43, 0.47] };

describe('rayObb', () => {
  it('hits the front of an axis-aligned box', () => {
    const t = rayObb([0, 0.5, 0], [0, 0, -1], couch);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(2.5 - 0.47, 6);
  });
  it('misses when aimed above it', () => {
    expect(rayObb([0, 1.6, 0], [0, 0, -1], couch)).toBeNull();
  });
  it('misses a box behind the ray origin', () => {
    expect(rayObb([0, 0.5, -4], [0, 0, -1], couch)).toBeNull();
  });
  it('returns 0 from inside the box', () => {
    expect(rayObb([0, 0.4, -2.5], [1, 0, 0], couch)).toBe(0);
  });
  it('respects rotation (a 45° yawed long box)', () => {
    const q = quatFromAxisAngle([0, 1, 0], Math.PI / 4);
    const box: OBB = { center: [0, 0.5, -2], quat: q, half: [1.5, 0.5, 0.05] };
    // a ray along the box's long axis direction from far away hits, one 1 m off its plane misses
    const along = rotate(q, [1, 0, 0]);
    expect(rayObb([-along[0] * 4, 0.5, -2 - along[2] * 4], along, box)).not.toBeNull();
    const normal = rotate(q, [0, 0, 1]);
    const off: [number, number, number] = [normal[0] * 1 - along[0] * 4, 0.5, -2 + normal[2] * 1 - along[2] * 4];
    expect(rayObb(off, along, box)).toBeNull();
  });
});

describe('box helpers', () => {
  it('builds a box from mesh min/max and pose', () => {
    const b = obbFromMinMax([-1, 0, -0.5], [1, 0.8, 0.5], [2, 0, -3], id);
    expect(b.center).toEqual([2, 0.4, -3]);
    expect(b.half).toEqual([1, 0.4, 0.5]);
  });
  it('reports width/height/depth with height on the vertical axis', () => {
    const d = obbDims(couch);
    expect(d.w).toBeCloseTo(2);
    expect(d.h).toBeCloseTo(0.86);
    expect(d.d).toBeCloseTo(0.94);
  });
  it('has six faces whose in-plane axes are right-handed with the normal', () => {
    for (const f of obbFaces(couch)) {
      const c = [
        f.u[1] * f.v[2] - f.u[2] * f.v[1],
        f.u[2] * f.v[0] - f.u[0] * f.v[2],
        f.u[0] * f.v[1] - f.u[1] * f.v[0],
      ];
      for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(f.normal[i], 6);
    }
  });
  it('tests point containment with a margin', () => {
    expect(pointInObb([0.99, 0.43, -2.5], couch)).toBe(true);
    expect(pointInObb([1.05, 0.43, -2.5], couch)).toBe(false);
    expect(pointInObb([1.05, 0.43, -2.5], couch, 0.1)).toBe(true);
  });
});
