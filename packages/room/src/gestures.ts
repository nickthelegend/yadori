import { type Vec3, dot, length, scale, sub } from './geometry.js';

export type Gesture = 'poke' | 'flick' | 'pet';

export interface FaceFrame {
  center: Vec3;
  normal: Vec3;
  /** face radius in metres */
  radius: number;
}

/** Tunables (metres, seconds). Exported so tests and the debug HUD can show them. */
export const GESTURE = {
  contactDepth: 0.015, // a fingertip within 1.5 cm of the face surface counts as touching
  pokeApproach: 0.15, // m/s toward the face when it crosses into contact
  flickSpeed: 1.2, // m/s fingertip speed for a flick
  flickReach: 1.5, // flick counts within 1.5 face radii
  petMinSpeed: 0.04,
  petMaxSpeed: 0.9,
  petPath: 0.2, // metres of stroking needed
  petWindow: 2.0, // seconds to collect that path
  petReach: 1.4,
  petHeight: 0.15,
  cooldown: { poke: 0.4, flick: 0.6, pet: 1.2 },
};

/**
 * Turns one hand's fingertip + palm samples into poke / flick / pet events for one face.
 * Deterministic and frame-rate independent (uses the sample timestamps).
 */
export class GestureTracker {
  private prevTip: Vec3 | null = null;
  private prevT = 0;
  private prevPalm: Vec3 | null = null;
  private petPath = 0;
  private petStart = -1;
  private lastNear = -Infinity;
  private cool: Record<Gesture, number> = { poke: -Infinity, flick: -Infinity, pet: -Infinity };
  /** true while a hand is within reach of the face (drives the eyes) */
  near = false;

  constructor(public face: FaceFrame) {}

  reset(): void {
    this.prevTip = null;
    this.prevPalm = null;
    this.petPath = 0;
    this.petStart = -1;
    this.near = false;
  }

  private local(p: Vec3): { dz: number; r: number } {
    const d = sub(p, this.face.center);
    const dz = dot(d, this.face.normal);
    const inPlane = sub(d, scale(this.face.normal, dz));
    return { dz, r: length(inPlane) };
  }

  private fire(g: Gesture, t: number): Gesture | null {
    if (t - this.cool[g] < GESTURE.cooldown[g]) return null;
    this.cool[g] = t;
    return g;
  }

  update(t: number, tip: Vec3 | null, palm: Vec3 | null): Gesture | null {
    const R = this.face.radius;
    let out: Gesture | null = null;
    if (!tip) {
      this.reset();
      return null;
    }
    const cur = this.local(tip);
    this.near = cur.r <= R * 2.5 && cur.dz > -0.05 && cur.dz < 0.35;
    if (this.near) this.lastNear = t;
    const dt = t - this.prevT;
    if (this.prevTip && dt > 1e-4 && dt < 0.25) {
      const v = scale(sub(tip, this.prevTip), 1 / dt);
      const speed = length(v);
      const vz = dot(v, this.face.normal);
      const vTan = Math.sqrt(Math.max(0, speed * speed - vz * vz));
      const prev = this.local(this.prevTip);
      // flick: fast, mostly sideways, passing close over the face
      if (
        speed >= GESTURE.flickSpeed &&
        vTan > 2 * Math.abs(vz) &&
        cur.r <= R * GESTURE.flickReach &&
        cur.dz > -0.03 &&
        cur.dz < 0.12
      ) {
        out = this.fire('flick', t);
      }
      // poke: crosses into contact on the face, moving toward it
      if (
        !out &&
        prev.dz > GESTURE.contactDepth &&
        cur.dz <= GESTURE.contactDepth &&
        cur.r <= R &&
        -vz >= GESTURE.pokeApproach
      ) {
        out = this.fire('poke', t);
      }
      // pet: the palm (or the fingertip) strokes slowly across the face, close to it
      const hand = palm ?? tip;
      const prevHand = palm ? this.prevPalm : this.prevTip;
      if (!out && prevHand) {
        const h = this.local(hand);
        const hv = length(sub(hand, prevHand)) / dt;
        const close = h.r <= R * GESTURE.petReach && h.dz > -0.02 && h.dz < GESTURE.petHeight;
        if (close && hv >= GESTURE.petMinSpeed && hv <= GESTURE.petMaxSpeed) {
          if (this.petStart < 0 || t - this.petStart > GESTURE.petWindow) {
            this.petStart = t;
            this.petPath = 0;
          }
          this.petPath += hv * dt;
          if (this.petPath >= GESTURE.petPath) {
            out = this.fire('pet', t);
            this.petPath = 0;
            this.petStart = -1;
          }
        } else if (!close) {
          this.petPath = 0;
          this.petStart = -1;
        }
      }
    }
    this.prevTip = tip;
    this.prevPalm = palm;
    this.prevT = t;
    return out;
  }
}

/** One pointer stroke on a face in the browser: positions in face radii, time in seconds. */
export interface StrokeSample {
  t: number;
  x: number;
  y: number;
}

/**
 * Browser/phone version: a short tap is a poke, a quick swipe is a flick, a slow rub
 * back and forth is a pet. Returns null for strokes that are none of these.
 */
export function classifyStroke(samples: StrokeSample[]): Gesture | null {
  if (samples.length === 0) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const duration = last.t - first.t;
  let path = 0;
  let maxSpeed = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    path += d;
    const dt = samples[i].t - samples[i - 1].t;
    if (dt > 1e-4) maxSpeed = Math.max(maxSpeed, d / dt);
  }
  const net = Math.hypot(last.x - first.x, last.y - first.y);
  if (path < 0.25 && duration < 0.45) return 'poke';
  if (maxSpeed >= 6 && net >= 0.8 && duration < 0.5) return 'flick';
  if (path >= 1.5 && duration >= 0.4) return 'pet';
  return null;
}
