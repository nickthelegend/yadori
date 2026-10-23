/** The five expressions and five mouth shapes of a character sheet (generated or built-in). */
export const EXPRESSIONS = ['neutral', 'happy', 'surprised', 'grumpy', 'sleepy'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const MOUTHS = ['rest', 'A', 'O', 'E', 'M'] as const;
export type MouthShape = (typeof MOUTHS)[number];

export function isExpression(x: unknown): x is Expression {
  return typeof x === 'string' && (EXPRESSIONS as readonly string[]).includes(x);
}

/**
 * Every continuous parameter the built-in face shader reads. The generated-sheet path uses
 * `expression` and `mouth` to pick images and the rest for motion (gaze, squash, wobble).
 */
export interface FaceParams {
  eyeOpen: number; // 0 closed .. 1 open
  eyeSmile: number; // 0 round eyes .. 1 happy ^ ^ arcs
  pupil: number; // pupil radius scale
  lookX: number; // -1 .. 1 (face-local, +x = face's right as you look at it)
  lookY: number; // -1 .. 1
  browY: number; // -1 low .. 1 raised
  browTilt: number; // -1 sad .. 1 angry (inner ends down)
  mouthOpen: number; // 0 .. 1
  mouthWide: number; // 0 .. 1
  mouthRound: number; // 0 .. 1 ("O")
  smile: number; // -1 frown .. 1 smile
  blush: number; // 0 .. 1
  squash: number; // -1 .. 1 (scale y = 1 - 0.25 squash)
  wobble: number; // radians around the face normal
  reveal: number; // 0 .. 1 bloom-in on wake, back to 0 on sleep
}

export const EXPRESSION_PARAMS: Record<Expression, Partial<FaceParams>> = {
  neutral: { eyeOpen: 1, eyeSmile: 0, pupil: 1, browY: 0, browTilt: 0, smile: 0.25, blush: 0.45 },
  happy: { eyeOpen: 1, eyeSmile: 0.85, pupil: 1, browY: 0.35, browTilt: -0.15, smile: 1, blush: 0.9 },
  surprised: { eyeOpen: 1.25, eyeSmile: 0, pupil: 0.65, browY: 1, browTilt: -0.3, smile: 0, blush: 0.2 },
  grumpy: { eyeOpen: 0.62, eyeSmile: 0, pupil: 1.05, browY: -0.6, browTilt: 1, smile: -0.8, blush: 0 },
  sleepy: { eyeOpen: 0.28, eyeSmile: 0, pupil: 1, browY: -0.25, browTilt: -0.4, smile: 0.1, blush: 0.15 },
};

export const MOUTH_PARAMS: Record<MouthShape, { open: number; wide: number; round: number }> = {
  rest: { open: 0, wide: 0.5, round: 0 },
  A: { open: 0.85, wide: 0.7, round: 0 },
  O: { open: 0.7, wide: 0.25, round: 1 },
  E: { open: 0.35, wide: 1, round: 0 },
  M: { open: 0, wide: 0.4, round: 0 },
};

export function restParams(): FaceParams {
  return {
    eyeOpen: 1,
    eyeSmile: 0,
    pupil: 1,
    lookX: 0,
    lookY: 0,
    browY: 0,
    browTilt: 0,
    mouthOpen: 0,
    mouthWide: 0.5,
    mouthRound: 0,
    smile: 0.25,
    blush: 0.25,
    squash: 0,
    wobble: 0,
    reveal: 0,
  };
}
