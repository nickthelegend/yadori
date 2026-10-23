import {
  type BoxFace,
  type OBB,
  type Vec3,
  add,
  cross,
  dot,
  normalize,
  obbFaces,
  scale,
  sub,
} from './geometry.js';

export interface FacePlacement {
  /** world position of the face centre (1 cm proud of the surface) */
  position: Vec3;
  /** outward surface normal of the chosen box face */
  normal: Vec3;
  /** world up for the face (the face's in-plane vertical axis) */
  up: Vec3;
  /** face diameter in metres */
  size: number;
  /** which box face (0..5) */
  faceIndex: number;
}

export const FACE_PROUD_M = 0.01;
export const FACE_FRACTION = 0.35;
export const FACE_MIN_M = 0.12;
export const FACE_MAX_M = 0.4;
export const FACE_MAX_TURN_DEG = 40;

/**
 * Picks the side of the box that points at the viewer (vertical faces only; tops and
 * bottoms are never chosen because a face lying flat cannot look at you).
 */
export function chooseFace(box: OBB, viewer: Vec3): BoxFace {
  const faces = obbFaces(box);
  let best: BoxFace | null = null;
  let bestScore = -Infinity;
  for (const f of faces) {
    if (Math.abs(f.normal[1]) > 0.7) continue; // horizontal face
    const toViewer = normalize(sub(viewer, f.center));
    const s = dot(f.normal, toViewer);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  // A box rotated so no face is vertical enough: fall back to the most viewer-facing face.
  if (!best) {
    for (const f of faces) {
      const s = dot(f.normal, normalize(sub(viewer, f.center)));
      if (s > bestScore) {
        bestScore = s;
        best = f;
      }
    }
  }
  return best as BoxFace;
}

/**
 * Face placement rule from the spec: on the box face that points at you, in its upper
 * third, 1 cm proud of the surface; the face is 35% of that face's smaller side, clamped
 * to 12-40 cm, and never wider or taller than the face itself.
 */
export function placeFace(box: OBB, viewer: Vec3): FacePlacement {
  const face = chooseFace(box, viewer);
  const width = face.halfU * 2;
  const height = face.halfV * 2;
  let size = Math.min(width, height) * FACE_FRACTION;
  size = Math.min(FACE_MAX_M, Math.max(FACE_MIN_M, size));
  size = Math.min(size, width, height);
  // in-plane vertical axis pointing up in the world
  const up = face.v[1] >= 0 ? face.v : scale(face.v, -1);
  // centre of the upper third, kept fully inside the face
  const vOffset = Math.max(0, Math.min(face.halfV * (2 / 3), face.halfV - size / 2));
  const position = add(add(face.center, scale(up, vOffset)), scale(face.normal, FACE_PROUD_M));
  return { position, normal: face.normal, up, size, faceIndex: face.index };
}

/**
 * Direction the face looks: the surface normal turned toward the viewer around the
 * face's up axis, at most `maxDeg` degrees, so it reads as part of the object rather than
 * a floating sticker. Returns a unit vector.
 */
export function turnToward(normal: Vec3, up: Vec3, from: Vec3, viewer: Vec3, maxDeg = FACE_MAX_TURN_DEG): Vec3 {
  const toViewer = sub(viewer, from);
  // project onto the plane perpendicular to up
  const flat = normalize(sub(toViewer, scale(up, dot(toViewer, up))));
  const n = normalize(sub(normal, scale(up, dot(normal, up))));
  if (flat[0] === 0 && flat[1] === 0 && flat[2] === 0) return normal;
  const side = cross(n, flat);
  const sin = dot(side, up);
  const cos = dot(n, flat);
  let angle = Math.atan2(sin, cos);
  const max = (maxDeg * Math.PI) / 180;
  angle = Math.max(-max, Math.min(max, angle));
  // rotate n around up by angle (Rodrigues; n is perpendicular to up)
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const upCrossN = cross(up, n);
  return normalize(add(scale(n, c), scale(upCrossN, s)));
}

/** Signed angle in degrees between the face normal and the turned direction (for tests and the HUD). */
export function turnAngleDeg(normal: Vec3, dir: Vec3): number {
  return (Math.acos(Math.max(-1, Math.min(1, dot(normalize(normal), normalize(dir))))) * 180) / Math.PI;
}
