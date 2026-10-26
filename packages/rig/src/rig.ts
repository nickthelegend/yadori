import { type MouthKey, shapeAt } from './mouth.js';
import { EXPRESSION_PARAMS, type Expression, type FaceParams, MOUTH_PARAMS, type MouthShape, restParams } from './shapes.js';

/** Small deterministic PRNG so blinks and idle glances are reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BLINK = { minGap: 2.2, maxGap: 5.5, duration: 0.16, doubleChance: 0.2 };

/** Blink schedule: eyes close over 40% of the blink and reopen over the rest. */
export class Blinker {
  private next: number;
  private start = -Infinity;
  private pendingDouble = false;
  constructor(private rand: () => number, t0 = 0) {
    this.next = t0 + 0.6 + rand() * 1.5;
  }
  /** Force a blink now (used right after waking: two quick blinks). */
  blinkNow(t: number, double = false): void {
    this.start = t;
    this.pendingDouble = double;
    this.next = t + BLINK.duration + (double ? 0.12 : BLINK.minGap + this.rand() * (BLINK.maxGap - BLINK.minGap));
  }
  /** Multiplier on eye openness, 0..1. */
  sample(t: number): number {
    if (t >= this.next) {
      this.start = t;
      const dbl = this.pendingDouble || this.rand() < BLINK.doubleChance;
      this.pendingDouble = false;
      this.next = t + BLINK.duration + (dbl ? 0.12 : BLINK.minGap + this.rand() * (BLINK.maxGap - BLINK.minGap));
    }
    const p = (t - this.start) / BLINK.duration;
    if (p < 0 || p > 1) return 1;
    return p < 0.4 ? 1 - p / 0.4 : (p - 0.4) / 0.6;
  }
}

export type Reaction = 'poke' | 'flick' | 'pet' | 'wake' | 'sleep' | 'think';

const REACTION_EXPR: Record<'poke' | 'flick' | 'pet', { expr: Expression; hold: number }> = {
  poke: { expr: 'surprised', hold: 0.9 },
  flick: { expr: 'grumpy', hold: 1.4 },
  pet: { expr: 'happy', hold: 1.8 },
};

/** Exponential approach, frame-rate independent. */
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * One face's animation state. The app feeds it time, gaze targets, speech mouth shapes
 * and reactions; it returns the parameters the face shader (or the sheet player) draws.
 */
export class FaceRig {
  readonly params: FaceParams = restParams();
  expression: Expression = 'neutral';
  mouth: MouthShape = 'rest';
  awake = false;
  private base: Expression = 'neutral';
  private overrideUntil = -Infinity;
  private blinker: Blinker;
  private rand: () => number;
  private t = 0;
  private gazeX = 0;
  private gazeY = 0;
  private idleUntil = 0;
  private idleX = 0;
  private idleY = 0;
  private hasTarget = false;
  // springs: value + velocity
  private sq = 0;
  private sqV = 0;
  private wb = 0;
  private wbV = 0;
  private revealTarget = 0;
  private expressionEyeOpen = 1;
  private speech: { keys: MouthKey[]; start: number; end: number } | null = null;
  private envelopeShape: MouthShape | null = null;
  thinking = false;

  constructor(seed = 1) {
    this.rand = mulberry32(seed);
    this.blinker = new Blinker(this.rand);
  }

  /** Persona or `emote` tool: the resting expression. */
  setExpression(e: Expression): void {
    this.base = e;
    if (this.t >= this.overrideUntil) this.expression = e;
  }

  /** Short expression for a reaction, then back to the base expression. */
  flash(e: Expression, hold: number): void {
    this.expression = e;
    this.overrideUntil = this.t + hold;
  }

  /**
   * Eye target in face-local units (-1..1 per axis; |v| > 1 is clamped). Pass null to let
   * the eyes wander (idle saccades).
   */
  lookAt(x: number | null, y = 0): void {
    if (x === null) {
      this.hasTarget = false;
      return;
    }
    this.hasTarget = true;
    const m = Math.hypot(x, y);
    const k = m > 1 ? 1 / m : 1;
    this.gazeX = x * k;
    this.gazeY = y * k;
  }

  react(r: Reaction): void {
    switch (r) {
      case 'wake':
        this.awake = true;
        this.revealTarget = 1;
        this.sqV += 12;
        this.blinker.blinkNow(this.t + 0.55, true);
        this.flash('surprised', 0.8);
        break;
      case 'sleep':
        this.awake = false;
        this.revealTarget = 0;
        this.setExpression('sleepy');
        this.speech = null;
        break;
      case 'think':
        this.thinking = true;
        break;
      case 'poke':
        this.sqV -= 16; // squash in
        this.flash(REACTION_EXPR.poke.expr, REACTION_EXPR.poke.hold);
        this.blinker.blinkNow(this.t);
        break;
      case 'flick':
        this.wbV += this.rand() < 0.5 ? 14 : -14;
        this.flash(REACTION_EXPR.flick.expr, REACTION_EXPR.flick.hold);
        break;
      case 'pet':
        this.sqV += 5;
        this.flash(REACTION_EXPR.pet.expr, REACTION_EXPR.pet.hold);
        break;
    }
  }

  /** Speak with a mouth timeline (text or boundary timing). `start` in rig time. */
  speak(keys: MouthKey[], duration: number, start = this.t): void {
    this.thinking = false;
    this.speech = { keys, start, end: start + duration };
    this.envelopeShape = null;
  }

  /** Audio path: the current shape from the analyser (null when the audio stops). */
  setEnvelopeShape(s: MouthShape | null): void {
    this.thinking = false;
    this.envelopeShape = s;
  }

  get speaking(): boolean {
    return (this.speech !== null && this.t < this.speech.end) || (this.envelopeShape !== null && this.envelopeShape !== 'rest');
  }

  get time(): number {
    return this.t;
  }

  update(dt: number): FaceParams {
    this.t += dt;
    const t = this.t;
    if (t >= this.overrideUntil) this.expression = this.base;
    const p = this.params;
    const e = EXPRESSION_PARAMS[this.expression];

    // mouth
    if (this.envelopeShape) this.mouth = this.envelopeShape;
    else if (this.speech && t < this.speech.end) this.mouth = shapeAt(this.speech.keys, t - this.speech.start);
    else {
      this.mouth = this.expression === 'surprised' ? 'O' : 'rest';
      if (this.speech && t >= this.speech.end) this.speech = null;
    }
    const m = MOUTH_PARAMS[this.mouth];
    const mouthRate = 28; // fast: lip-sync lag stays well under one 72 Hz frame budget
    p.mouthOpen = approach(p.mouthOpen, m.open, mouthRate, dt);
    p.mouthWide = approach(p.mouthWide, m.wide, mouthRate, dt);
    p.mouthRound = approach(p.mouthRound, m.round, mouthRate, dt);

    // expression blend
    const er = 10;
    p.eyeSmile = approach(p.eyeSmile, e.eyeSmile ?? 0, er, dt);
    p.pupil = approach(p.pupil, e.pupil ?? 1, er, dt);
    p.browY = approach(p.browY, (e.browY ?? 0) + (this.thinking ? 0.4 : 0), er, dt);
    p.browTilt = approach(p.browTilt, e.browTilt ?? 0, er, dt);
    p.smile = approach(p.smile, e.smile ?? 0, er, dt);
    p.blush = approach(p.blush, e.blush ?? 0, 4, dt);
    this.expressionEyeOpen = approach(this.expressionEyeOpen, (e.eyeOpen ?? 1) * (this.awake ? 1 : 0.05), 40, dt);
    // The blink already has its own closing/opening envelope. Smoothing it again
    // prevents the short closure from ever reaching the shader's closed-eye range.
    p.eyeOpen = this.expressionEyeOpen * this.blinker.sample(t);

    // gaze: target, thinking (up and aside), or idle saccades
    let gx = this.gazeX;
    let gy = this.gazeY;
    if (this.thinking) {
      gx = 0.55;
      gy = 0.7;
    } else if (!this.hasTarget) {
      if (t >= this.idleUntil) {
        this.idleX = (this.rand() * 2 - 1) * 0.6;
        this.idleY = (this.rand() * 2 - 1) * 0.35;
        this.idleUntil = t + 0.8 + this.rand() * 2.2;
      }
      gx = this.idleX;
      gy = this.idleY;
    }
    p.lookX = approach(p.lookX, gx, 18, dt);
    p.lookY = approach(p.lookY, gy, 18, dt);

    // springs: squash (stiff, bouncy) and wobble (looser)
    const k1 = 180;
    const c1 = 9;
    this.sqV += (-k1 * this.sq - c1 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    if (this.speaking) this.sq += Math.sin(t * 9) * 0.004; // a little bounce while talking
    p.squash = Math.max(-1, Math.min(1, this.sq * 0.3));
    const k2 = 90;
    const c2 = 5;
    this.wbV += (-k2 * this.wb - c2 * this.wbV) * dt;
    this.wb += this.wbV * dt;
    p.wobble = Math.max(-0.8, Math.min(0.8, this.wb * 0.25));

    // reveal: bloom in fast with a little overshoot, fade out slower
    p.reveal = approach(p.reveal, this.revealTarget, this.revealTarget > p.reveal ? 5 : 2.5, dt);
    if (Math.abs(p.reveal - this.revealTarget) < 1e-3) p.reveal = this.revealTarget;
    return p;
  }
}
