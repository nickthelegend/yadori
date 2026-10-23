/**
 * One pooled particle system for every effect: wake sparkles, hearts when petted, stars
 * when flicked, and the whisper stream that flows from one spirit to another while they
 * gossip. CPU-simulated (≤ 600 particles), drawn as one Points draw call.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
} from '@iwsdk/core';

export const enum PKind {
  Sparkle = 0,
  Heart = 1,
  Dot = 2,
}

const MAX = 600;

const vertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
attribute vec3 aColor;
varying float vAlpha;
varying float vKind;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha; vKind = aKind; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vKind;
varying vec3 vColor;
float heart(vec2 p) {
  p.y = -p.y + 0.15;
  p *= 1.25;
  float a = atan(p.x, p.y) / 3.14159;
  float r = length(p);
  float h = abs(a);
  float d = (13.0 * h - 22.0 * h * h + 10.0 * h * h * h) / (6.0 - 5.0 * h);
  return r - d * 0.55;
}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = 0.0;
  if (vKind < 0.5) {
    // four-point sparkle
    float d = min(abs(p.x) * 6.0 + abs(p.y), abs(p.y) * 6.0 + abs(p.x));
    a = 1.0 - smoothstep(0.55, 1.0, d);
    a = max(a, 1.0 - smoothstep(0.0, 0.35, length(p)));
  } else if (vKind < 1.5) {
    a = 1.0 - smoothstep(-0.02, 0.04, heart(p));
  } else {
    a = 1.0 - smoothstep(0.35, 1.0, length(p));
  }
  a *= vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

interface P {
  life: number;
  max: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  kind: number;
  r: number; g: number; b: number;
  gravity: number;
  // path-following (whispers)
  path: null | { ax: number; ay: number; az: number; cx: number; cy: number; cz: number; bx: number; by: number; bz: number };
}

export class Particles {
  readonly points: Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private kind = new Float32Array(MAX);
  private pool: P[] = [];
  private next = 0;
  private c = new Color();
  private rand: () => number;
  live = 0;

  constructor(name: string, seed = 99, additive = false) {
    let s = seed;
    this.rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < MAX; i++)
      this.pool.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, kind: 0, r: 1, g: 1, b: 1, gravity: 0, path: null });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    g.setAttribute('aKind', new BufferAttribute(this.kind, 1));
    const m = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      uniforms: { uScale: { value: 300 } },
    });
    this.points = new Points(g, m);
    this.points.name = name;
    this.points.frustumCulled = false;
    this.points.renderOrder = 25;
  }

  /** Pixel scale: set from the canvas height so sizes read the same on every screen. */
  setScale(viewportHeightPx: number): void {
    (this.points.material as ShaderMaterial).uniforms.uScale.value = viewportHeightPx * 0.5;
  }

  private take(): P {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % MAX;
    return p;
  }

  /** Burst of sparkles over a box (wake), rising and swirling. */
  burstBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, count: number, colors: string[]): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      p.path = null;
      p.x = cx + (this.rand() * 2 - 1) * hx;
      p.y = cy + (this.rand() * 2 - 1) * hy;
      p.z = cz + (this.rand() * 2 - 1) * hz;
      const a = this.rand() * Math.PI * 2;
      p.vx = Math.cos(a) * 0.25;
      p.vz = Math.sin(a) * 0.25;
      p.vy = 0.2 + this.rand() * 0.6;
      p.gravity = -0.15;
      p.life = p.max = 0.9 + this.rand() * 0.9;
      p.size = 0.025 + this.rand() * 0.035;
      p.kind = PKind.Sparkle;
      this.c.set(colors[i % colors.length]);
      p.r = this.c.r; p.g = this.c.g; p.b = this.c.b;
    }
  }

  /** Small fountain from a point (hearts on a pet, stars on a flick). */
  fountain(x: number, y: number, z: number, count: number, kind: PKind, color: string, speed = 0.5): void {
    this.c.set(color);
    for (let i = 0; i < count; i++) {
      const p = this.take();
      p.path = null;
      p.x = x; p.y = y; p.z = z;
      const a = this.rand() * Math.PI * 2;
      const s = speed * (0.4 + this.rand() * 0.6);
      p.vx = Math.cos(a) * s * 0.6;
      p.vz = Math.sin(a) * s * 0.6;
      p.vy = s * (0.6 + this.rand() * 0.6);
      p.gravity = kind === PKind.Heart ? 0.1 : -1.2;
      p.life = p.max = kind === PKind.Heart ? 1.4 + this.rand() * 0.6 : 0.6 + this.rand() * 0.4;
      p.size = kind === PKind.Heart ? 0.05 + this.rand() * 0.03 : 0.03 + this.rand() * 0.02;
      p.kind = kind;
      p.r = this.c.r; p.g = this.c.g; p.b = this.c.b;
    }
  }

  /** One whisper dot travelling from a to b over an arc (call repeatedly while gossiping). */
  whisper(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: string): void {
    const p = this.take();
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const d = Math.hypot(bx - ax, bz - az);
    p.path = { ax, ay, az, bx, by, bz, cx: mx + (this.rand() - 0.5) * 0.15, cy: Math.max(ay, by) + 0.25 + d * 0.25, cz: mz + (this.rand() - 0.5) * 0.15 };
    p.life = p.max = 1.1;
    p.size = 0.018 + this.rand() * 0.016;
    p.kind = this.rand() < 0.2 ? PKind.Sparkle : PKind.Dot;
    this.c.set(color);
    p.r = this.c.r; p.g = this.c.g; p.b = this.c.b;
    p.x = ax; p.y = ay; p.z = az;
  }

  update(dt: number): void {
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (p.life <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      if (p.path) {
        const t = 1 - k;
        const u = 1 - t;
        const q = p.path;
        p.x = u * u * q.ax + 2 * u * t * q.cx + t * t * q.bx;
        p.y = u * u * q.ay + 2 * u * t * q.cy + t * t * q.by + Math.sin(t * 18 + i) * 0.01;
        p.z = u * u * q.az + 2 * u * t * q.cz + t * t * q.bz;
      } else {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 0.985;
        p.vz *= 0.985;
      }
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r;
      this.col[i * 3 + 1] = p.g;
      this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size * (p.path ? 1 : 0.6 + 0.4 * Math.sin(k * Math.PI));
      this.alpha[i] = Math.min(1, k * 3) * (p.path ? Math.sin(k * Math.PI) * 1.4 : 1);
      this.kind[i] = p.kind;
      live++;
    }
    this.live = live;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aKind.needsUpdate = true;
    this.points.visible = live > 0;
  }
}
