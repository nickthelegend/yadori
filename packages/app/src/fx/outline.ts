/**
 * Dotted outline around a furniture volume: a box whose fragment shader draws only its
 * edges, as animated dots. `hover` fades it in when a hand ray or cursor touches the
 * object; `breathe` pulses it while the object wakes. One draw call per outline.
 */
import { BackSide, BoxGeometry, Color, FrontSide, Mesh, ShaderMaterial, Vector3 } from '@iwsdk/core';

const vertex = /* glsl */ `
varying vec3 vLocal;
uniform vec3 uHalf;
void main() {
  vLocal = position * uHalf * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
varying vec3 vLocal;
uniform vec3 uHalf;
uniform vec3 uColor;
uniform float uTime, uHover, uBreathe;
void main() {
  vec3 q = abs(vLocal) / uHalf;          // 0..1 per axis, 1 on the faces
  // distance (m) to the nearest box edge: two coordinates at their maximum
  vec3 e = (1.0 - q) * uHalf;
  float d = min(min(max(e.x, e.y), max(e.y, e.z)), max(e.x, e.z));
  float w = 0.006 + 0.01 * uBreathe;
  float edge = 1.0 - smoothstep(w, w * 1.8, d);
  // dots along the edge: param = coordinate along the axis that is not at the edge
  float along = (e.x > e.y && e.x > e.z) ? vLocal.x : ((e.y > e.z) ? vLocal.y : vLocal.z);
  float dots = step(0.45, fract(along * 18.0 - uTime * 0.8));
  float face = 0.06 * uBreathe * (0.5 + 0.5 * sin(uTime * 6.0));
  float a = edge * mix(dots, 1.0, uBreathe) * max(uHover, uBreathe) + face;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class Outline {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  constructor(name: string) {
    this.mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      side: FrontSide,
      uniforms: {
        uHalf: { value: new Vector3(0.5, 0.5, 0.5) },
        uColor: { value: new Color('#fff8ec') },
        uTime: { value: 0 },
        uHover: { value: 0 },
        uBreathe: { value: 0 },
      },
    });
    this.mesh = new Mesh(new BoxGeometry(1, 1, 1), this.mat);
    this.mesh.name = name;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  /** Fit to a box (half extents, metres). The mesh's scale carries the size. */
  fit(hx: number, hy: number, hz: number): void {
    const pad = 0.015;
    this.mesh.scale.set((hx + pad) * 2, (hy + pad) * 2, (hz + pad) * 2);
    (this.mat.uniforms.uHalf.value as Vector3).set(hx + pad, hy + pad, hz + pad);
  }

  set(time: number, hover: number, breathe: number, color: string): void {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHover.value = hover;
    u.uBreathe.value = breathe;
    (u.uColor.value as Color).set(color);
    this.mesh.visible = hover > 0.01 || breathe > 0.01;
    // draw the far faces too while breathing so the whole box glows
    this.mat.side = breathe > 0.01 ? (BackSide as typeof FrontSide) : FrontSide;
  }
}
