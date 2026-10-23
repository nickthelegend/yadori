import { type OBB, type Vec3, cross, distance, dot, normalize, obbDims, sub } from './geometry.js';
import { normaliseLabel } from './labels.js';

/** One piece of the room as the app sees it (from XRMesh, or from the browser diorama). */
export interface RoomObject {
  id: string;
  label: string;
  box: OBB;
}

export interface Neighbour {
  label: string;
  distance_m: number;
  /** where it is from this object's point of view, seen by the viewer: left/right/behind/in front */
  side: 'left' | 'right' | 'in front' | 'behind';
  awake: boolean;
}

/**
 * Exactly what Muse Spark gets about the room (no pixels unless the camera path ran).
 * The persona may only be grounded in these facts.
 */
export interface RoomContext {
  self: { id: string; label: string; dims_m: [number, number, number]; height_of_top_m: number };
  viewer: { distance_m: number; eye_height_m: number };
  neighbours: Neighbour[];
  room: { object_count: number; labels: string[] };
  local_time: string;
  description?: string;
  source: 'camera' | 'label';
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function buildRoomContext(
  self: RoomObject,
  all: RoomObject[],
  viewer: Vec3,
  opts: { awakeIds?: Set<string>; now?: Date; description?: string; source?: 'camera' | 'label'; floorY?: number } = {},
): RoomContext {
  const dims = obbDims(self.box);
  const floorY = opts.floorY ?? 0;
  const toViewer = normalize(sub(viewer, self.box.center));
  const up: Vec3 = [0, 1, 0];
  const right = normalize(cross(toViewer, up)); // viewer's left/right, mirrored for the object
  const neighbours: Neighbour[] = all
    .filter((o) => o.id !== self.id)
    .map((o) => {
      const d = sub(o.box.center, self.box.center);
      const lateral = dot(d, right);
      const depth = dot(d, toViewer);
      let side: Neighbour['side'];
      if (Math.abs(lateral) >= Math.abs(depth)) side = lateral > 0 ? 'left' : 'right';
      else side = depth > 0 ? 'in front' : 'behind';
      return {
        label: normaliseLabel(o.label),
        distance_m: r2(distance(o.box.center, self.box.center)),
        side,
        awake: opts.awakeIds?.has(o.id) ?? false,
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 6);
  const now = opts.now ?? new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return {
    self: {
      id: self.id,
      label: normaliseLabel(self.label),
      dims_m: [r2(dims.w), r2(dims.h), r2(dims.d)],
      height_of_top_m: r2(self.box.center[1] + dims.h / 2 - floorY),
    },
    viewer: { distance_m: r2(distance(viewer, self.box.center)), eye_height_m: r2(viewer[1] - floorY) },
    neighbours,
    room: { object_count: all.length, labels: [...new Set(all.map((o) => normaliseLabel(o.label)))].sort() },
    local_time: `${hh}:${mm}`,
    ...(opts.description ? { description: opts.description } : {}),
    source: opts.source ?? 'label',
  };
}
