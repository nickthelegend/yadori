import { describe, expect, it } from 'vitest';
import {
  type Candidate,
  type RoomObject,
  buildRoomContext,
  chipText,
  cleanUserLabel,
  labelKind,
  matches,
  rematch,
  rematchAll,
} from '../src/index.js';

const id: [number, number, number, number] = [0, 0, 0, 1];
const room: RoomObject[] = [
  { id: 'couch', label: 'couch', box: { center: [0, 0.43, -2.5], quat: id, half: [1, 0.43, 0.47] } },
  { id: 'lamp', label: 'lamp', box: { center: [-1.6, 0.86, -2.6], quat: id, half: [0.2, 0.86, 0.2] } },
  { id: 'plant', label: 'plant', box: { center: [1.7, 0.97, -2.4], quat: id, half: [0.37, 0.97, 0.37] } },
  { id: 'table', label: 'table', box: { center: [0, 0.22, -1.3], quat: id, half: [0.57, 0.22, 0.3] } },
];

describe('labels', () => {
  it('classifies labels', () => {
    expect(labelKind('couch')).toBe('wakeable');
    expect(labelKind('WALL')).toBe('structure');
    expect(labelKind('other')).toBe('needs-name');
    expect(labelKind(undefined)).toBe('needs-name');
  });
  it('makes the hover chip', () => {
    expect(chipText('couch', 2, 0.86)).toBe('couch · 2.0 × 0.9 m');
    expect(chipText('other', 1, 1)).toBe('Tell me what this is');
  });
  it('cleans a spoken name', () => {
    expect(cleanUserLabel('This is a Coat Rack!')).toBe('coat rack');
    expect(cleanUserLabel('x')).toBeNull();
  });
});

describe('room context', () => {
  it('lists neighbours nearest first with sides from the viewer', () => {
    const ctx = buildRoomContext(room[0], room, [0, 1.6, 0], { now: new Date(2026, 9, 26, 19, 40), awakeIds: new Set(['lamp']) });
    expect(ctx.self.label).toBe('couch');
    expect(ctx.self.dims_m).toEqual([2, 0.86, 0.94]);
    expect(ctx.local_time).toBe('19:40');
    expect(ctx.neighbours[0].label).toBe('table');
    expect(ctx.neighbours[0].side).toBe('in front');
    const lamp = ctx.neighbours.find((n) => n.label === 'lamp')!;
    expect(lamp.side).toBe('left');
    expect(lamp.awake).toBe(true);
    expect(ctx.neighbours.find((n) => n.label === 'plant')!.side).toBe('right');
    expect(ctx.source).toBe('label');
    expect(ctx.room.labels).toEqual(['couch', 'lamp', 'plant', 'table']);
  });
});

describe('re-match', () => {
  const home = { label: 'couch', dims: [2, 0.86, 0.94] as [number, number, number], position: [0, 0.43, -2.5] as [number, number, number] };
  const c = (id: string, dims: [number, number, number], position: [number, number, number], label = 'couch'): Candidate => ({ id, label, dims, position });
  it('accepts ±10% dims and ≤ 30 cm', () => {
    expect(matches(home, c('a', [2.19, 0.9, 0.9], [0.29, 0.43, -2.5]))).toBe(true);
  });
  it('rejects 11% dims, 31 cm, or another label', () => {
    expect(matches(home, c('a', [2.23, 0.86, 0.94], [0, 0.43, -2.5]))).toBe(false);
    expect(matches(home, c('a', [2, 0.86, 0.94], [0.31, 0.43, -2.5]))).toBe(false);
    expect(matches(home, c('a', [2, 0.86, 0.94], [0, 0.43, -2.5], 'bed'))).toBe(false);
  });
  it('picks the nearest free candidate', () => {
    const cands = [c('far', [2, 0.86, 0.94], [0.25, 0.43, -2.5]), c('near', [2, 0.86, 0.94], [0.05, 0.43, -2.5])];
    expect(rematch(home, cands)!.id).toBe('near');
    expect(rematch(home, cands, new Set(['near']))!.id).toBe('far');
  });
  it('assigns two identical couches one each', () => {
    const homes = [
      { ...home, spiritId: 's1' },
      { ...home, spiritId: 's2', position: [0.2, 0.43, -2.5] as [number, number, number] },
    ];
    const cands = [c('a', [2, 0.86, 0.94], [0, 0.43, -2.5]), c('b', [2, 0.86, 0.94], [0.21, 0.43, -2.5])];
    const m = rematchAll(homes, cands);
    expect(m.get('s1')!.id).toBe('a');
    expect(m.get('s2')!.id).toBe('b');
  });
});
