/**
 * The built-in face: one quad, one draw call, drawn entirely in the fragment shader from
 * signed-distance shapes (eyes, pupils, highlights, brows, mouth, tongue, cheeks). It is
 * our own vector design, shipped in the repo, and the UI labels it "Built-in face, not
 * generated". Every parameter comes from @yadori/rig's FaceParams.
 */
import { Color, DoubleSide, ShaderMaterial, Vector2 } from '@iwsdk/core';
import type { FaceParams } from '@yadori/rig';

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uEyeOpen, uEyeSmile, uPupil, uBrowY, uBrowTilt;
uniform vec2 uLook;
uniform float uMouthOpen, uMouthWide, uMouthRound, uSmile, uBlush, uReveal, uTime, uHover;
uniform vec3 uInk, uWhite, uCheek, uTongue, uLine;

float sdEllipse(vec2 p, vec2 r) {
  // fast approximation, good enough for small eccentricities
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
// parabola stroke y = c * x^2 for |x| < w (distance approximated along y)
float sdCurve(vec2 p, float w, float c) {
  float x = clamp(p.x, -w, w);
  vec2 q = vec2(x, c * x * x);
  float slope = 2.0 * c * x;
  return abs((p.y - q.y)) / sqrt(1.0 + slope * slope) + max(abs(p.x) - w, 0.0);
}
float fill(float d) { float aa = fwidth(d) * 1.2; return 1.0 - smoothstep(-aa, aa, d); }
float stroke(float d, float w) { return fill(abs(d) - w); }

vec4 over(vec4 dst, vec3 c, float a) { return vec4(mix(dst.rgb, c, a), dst.a + a * (1.0 - dst.a)); }

vec4 eye(vec2 p, float side, vec4 col) {
  vec2 c = vec2(0.36 * side, 0.12);
  vec2 q = p - c;
  float open = clamp(uEyeOpen, 0.0, 1.3);
  vec2 r = vec2(0.215, 0.26 * max(open, 0.04));
  // happy eyes: an upward arc instead of an open eye
  float happy = clamp(uEyeSmile, 0.0, 1.0);
  float closed = 1.0 - smoothstep(0.08, 0.22, open);
  float arcMix = max(happy, closed);
  float dEye = sdEllipse(q, r);
  vec4 openCol = col;
  openCol = over(openCol, uLine, fill(dEye - 0.05));          // outline
  openCol = over(openCol, uWhite, fill(dEye));                 // white
  vec2 pc = uLook * vec2(0.085, 0.08 * open);
  float pr = 0.122 * uPupil;
  float dPupil = length(q - pc) - pr;
  openCol = over(openCol, uInk, fill(max(dPupil, dEye)));
  float dGlint = length(q - pc - vec2(0.04, 0.05)) - 0.038;
  openCol = over(openCol, uWhite, fill(max(dGlint, dEye)));
  // arc: "^" when happy, a gentle "u" lash line when closed
  float dArc = sdCurve(q - vec2(0.0, mix(-0.02, 0.03, happy)), 0.19, mix(2.0, -3.2, happy));
  vec4 arcCol = over(col, uLine, stroke(dArc, 0.04));
  return mix(openCol, arcCol, arcMix);
}

void main() {
  vec2 p = vUv;
  // bloom-in: the face draws itself outward from the centre while waking
  float reveal = clamp(uReveal, 0.0, 1.0);
  float wipe = 1.0 - smoothstep(reveal * 1.7 - 0.25, reveal * 1.7, length(p));
  if (wipe <= 0.001) discard;
  vec4 col = vec4(0.0);

  // cheeks (under everything)
  float dCheek = min(sdEllipse(p - vec2(-0.6, -0.22), vec2(0.15, 0.09)), sdEllipse(p - vec2(0.6, -0.22), vec2(0.15, 0.09)));
  float cheekA = (1.0 - smoothstep(-0.06, 0.05, dCheek)) * uBlush * 0.85;
  col = over(col, uCheek, cheekA);

  col = eye(p, -1.0, col);
  col = eye(p, 1.0, col);

  // brows: tilt > 0 = inner ends down (grumpy)
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    vec2 c = vec2(0.36 * side, 0.5 + 0.08 * uBrowY);
    // inner end is the one nearest the centre
    vec2 inner = c + vec2(-0.12 * side, -0.06 * uBrowTilt);
    vec2 outer = c + vec2(0.12 * side, 0.06 * uBrowTilt);
    col = over(col, uLine, fill(sdSegment(p, inner, outer) - 0.038));
  }

  // mouth
  vec2 mc = p - vec2(0.0, -0.38);
  float w = 0.15 + 0.15 * uMouthWide - 0.07 * uMouthRound;
  float h = 0.014 + 0.24 * uMouthOpen;
  float open = smoothstep(0.03, 0.12, uMouthOpen);
  // closed mouth: a smile/frown curve
  float dLine = sdCurve(mc - vec2(0.0, -0.02 * uSmile), w, 1.6 * uSmile);
  vec4 closedCol = over(col, uLine, stroke(dLine, 0.034));
  // open mouth: ellipse lifted at the corners by the smile
  vec2 mq = mc - vec2(0.0, 0.5 * uSmile * mc.x * mc.x * 6.0 * 0.15);
  float dMouth = sdEllipse(mq, vec2(w, h));
  vec4 openCol = over(col, uLine, fill(dMouth - 0.03));
  openCol = over(openCol, vec3(0.23, 0.06, 0.09), fill(dMouth));
  float dTongue = sdEllipse(mq - vec2(0.0, -h * 0.55), vec2(w * 0.6, h * 0.5));
  openCol = over(openCol, uTongue, fill(max(dTongue, dMouth)));
  col = mix(closedCol, openCol, open);

  // hover glow ring (hand ray / cursor on the face)
  float halo = smoothstep(1.0, 0.8, length(p)) * smoothstep(0.55, 0.85, length(p));
  col = over(col, uCheek, halo * uHover * 0.35);

  col.a *= wipe;
  if (col.a < 0.01) discard;
  gl_FragColor = vec4(col.rgb, col.a);
}`;

export interface FaceStyle {
  /** lines drawn in cream instead of ink, for dark surfaces (screens) */
  onDark: boolean;
}

export function createFaceMaterial(style: FaceStyle): ShaderMaterial {
  const ink = new Color('#121212');
  const cream = new Color('#fff8ec');
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uEyeOpen: { value: 1 },
      uEyeSmile: { value: 0 },
      uPupil: { value: 1 },
      uLook: { value: new Vector2() },
      uBrowY: { value: 0 },
      uBrowTilt: { value: 0 },
      uMouthOpen: { value: 0 },
      uMouthWide: { value: 0.5 },
      uMouthRound: { value: 0 },
      uSmile: { value: 0.25 },
      uBlush: { value: 0.25 },
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uInk: { value: ink },
      uWhite: { value: new Color('#fffdf8') },
      uCheek: { value: new Color('#ff9db0') },
      uTongue: { value: new Color('#ff6f8a') },
      uLine: { value: style.onDark ? cream : ink },
    },
  });
}

/** Copies rig parameters into the material's uniforms (no allocation). */
export function applyFaceParams(m: ShaderMaterial, p: FaceParams, time: number, hover: number): void {
  const u = m.uniforms;
  u.uEyeOpen.value = p.eyeOpen;
  u.uEyeSmile.value = p.eyeSmile;
  u.uPupil.value = p.pupil;
  (u.uLook.value as Vector2).set(p.lookX, p.lookY);
  u.uBrowY.value = p.browY;
  u.uBrowTilt.value = p.browTilt;
  u.uMouthOpen.value = p.mouthOpen;
  u.uMouthWide.value = p.mouthWide;
  u.uMouthRound.value = p.mouthRound;
  u.uSmile.value = p.smile;
  u.uBlush.value = p.blush;
  u.uReveal.value = p.reveal;
  u.uTime.value = time;
  u.uHover.value = hover;
}
