/**
 * Small, allocation-light vector math for oriented boxes. No three.js here so the
 * same code runs in the headset app, the gateway and the tests.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

/** An oriented bounding box: a furniture volume from WebXR mesh detection. */
export interface OBB {
  center: Vec3;
  quat: Quat;
  /** half extents along the box's local x, y, z */
  half: Vec3;
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/** Rotate v by unit quaternion q. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

export const conjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}

/** World axes of the box (columns of its rotation). */
export function obbAxes(box: OBB): [Vec3, Vec3, Vec3] {
  return [rotate(box.quat, [1, 0, 0]), rotate(box.quat, [0, 1, 0]), rotate(box.quat, [0, 0, 1])];
}

/**
 * Ray vs oriented box (slab test in the box frame). Returns the entry distance along the
 * ray (0 when the origin is inside) or null when it misses. `dir` need not be unit length;
 * the distance is in units of `dir`.
 */
export function rayObb(origin: Vec3, dir: Vec3, box: OBB): number | null {
  const inv = conjugate(box.quat);
  const o = rotate(inv, sub(origin, box.center));
  const d = rotate(inv, dir);
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    const h = box.half[i];
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < -h || o[i] > h) return null;
      continue;
    }
    let t1 = (-h - o[i]) / d[i];
    let t2 = (h - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null;
  return Math.max(0, tMin);
}

/** True when the world point lies inside the box grown by `margin` metres. */
export function pointInObb(p: Vec3, box: OBB, margin = 0): boolean {
  const l = rotate(conjugate(box.quat), sub(p, box.center));
  return (
    Math.abs(l[0]) <= box.half[0] + margin &&
    Math.abs(l[1]) <= box.half[1] + margin &&
    Math.abs(l[2]) <= box.half[2] + margin
  );
}

export interface BoxFace {
  /** 0..5: +x, -x, +y, -y, +z, -z in the box frame */
  index: number;
  normal: Vec3;
  center: Vec3;
  /** in-plane axes: u horizontal-ish, v vertical-ish (world) */
  u: Vec3;
  v: Vec3;
  halfU: number;
  halfV: number;
}

/** The six faces of the box with world normals, centres and in-plane axes. */
export function obbFaces(box: OBB): BoxFace[] {
  const [ax, ay, az] = obbAxes(box);
  const [hx, hy, hz] = box.half;
  const mk = (index: number, n: Vec3, h: number, u: Vec3, hu: number, v: Vec3, hv: number): BoxFace => ({
    index,
    normal: n,
    center: add(box.center, scale(n, h)),
    u,
    v,
    halfU: hu,
    halfV: hv,
  });
  return [
    mk(0, ax, hx, scale(az, -1), hz, ay, hy),
    mk(1, scale(ax, -1), hx, az, hz, ay, hy),
    mk(2, ay, hy, ax, hx, scale(az, -1), hz),
    mk(3, scale(ay, -1), hy, ax, hx, az, hz),
    mk(4, az, hz, ax, hx, ay, hy),
    mk(5, scale(az, -1), hz, scale(ax, -1), hx, ay, hy),
  ];
}

/** Box from WebXR mesh min/max (mesh-local) plus the mesh pose. */
export function obbFromMinMax(min: Vec3, max: Vec3, position: Vec3, quat: Quat): OBB {
  const localCenter: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return {
    center: add(position, rotate(quat, localCenter)),
    quat,
    half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
  };
}

/** World-space size [w, h, d] of the box, measured along its own axes, height = the most vertical axis. */
export function obbDims(box: OBB): { w: number; h: number; d: number } {
  const axes = obbAxes(box);
  let up = 0;
  let best = -1;
  for (let i = 0; i < 3; i++) {
    const a = Math.abs(axes[i][1]);
    if (a > best) {
      best = a;
      up = i;
    }
  }
  const others = [0, 1, 2].filter((i) => i !== up).map((i) => box.half[i] * 2);
  others.sort((a, b) => b - a);
  return { w: others[0], h: box.half[up] * 2, d: others[1] };
}
