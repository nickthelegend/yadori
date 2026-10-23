/**
 * Canvas-drawn text planes for speech bubbles and hover chips. One quad and one texture
 * each; the canvas is redrawn only when the text changes (never per frame), so a bubble
 * revealing word by word costs one small texture upload per word.
 */
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

export const FONT_SANS = "'Satoshi', 'Atkinson Hyperlegible', system-ui, sans-serif";
export const FONT_MONO = "'Atkinson Hyperlegible Mono', ui-monospace, monospace";

const plane = new PlaneGeometry(1, 1);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface BubbleContent {
  speaker: string;
  /** honesty tag shown in the bubble header, e.g. "puppet line" or "Muse Spark" */
  tag: string;
  text: string;
  /** how many words are revealed so far */
  shown: number;
  /** a reaction glyph instead of text ("!", "?!", "♥", "zzz") */
  glyph?: string;
}

/** A speech bubble with a tail pointing down at the face. Width in metres is set by the caller via scale. */
export class Bubble {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private key = '';
  aspect = 2;

  constructor(name: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 768;
    this.canvas.height = 384;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: DoubleSide });
    this.mesh = new Mesh(plane, mat);
    this.mesh.name = name;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  set(c: BubbleContent | null): void {
    if (!c) {
      this.mesh.visible = false;
      this.key = '';
      return;
    }
    const key = `${c.speaker}|${c.tag}|${c.text}|${c.shown}|${c.glyph ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    const { ctx, canvas } = this;
    const W = canvas.width;
    ctx.clearRect(0, 0, W, canvas.height);
    if (c.glyph) {
      // compact round reaction bubble
      ctx.fillStyle = '#fff8ec';
      ctx.strokeStyle = '#121212';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(W / 2, 150, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.glyph === '♥' ? '#ff4f7a' : '#121212';
      ctx.font = `700 120px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.glyph, W / 2, 158);
      this.aspect = W / canvas.height;
      this.tex.needsUpdate = true;
      this.mesh.visible = true;
      return;
    }
    const words = c.text.split(/\s+/).filter(Boolean);
    const shownText = words.slice(0, Math.max(0, c.shown)).join(' ');
    ctx.font = `500 44px ${FONT_SANS}`;
    const allLines = wrap(ctx, c.text, W - 120);
    const lines = wrap(ctx, shownText, W - 120);
    const lineH = 54;
    const boxH = Math.min(canvas.height - 50, 96 + Math.max(1, allLines.length) * lineH);
    const y0 = canvas.height - 50 - boxH;
    // bubble body + tail
    ctx.fillStyle = '#fff8ec';
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 7;
    roundRect(ctx, 14, y0, W - 28, boxH, 40);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - 34, y0 + boxH - 4);
    ctx.lineTo(W / 2, canvas.height - 6);
    ctx.lineTo(W / 2 + 30, y0 + boxH - 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff8ec';
    ctx.fillRect(W / 2 - 30, y0 + boxH - 10, 58, 9);
    // header: speaker + honesty tag
    ctx.font = `700 30px ${FONT_SANS}`;
    ctx.fillStyle = '#2b4cff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(c.speaker, 52, y0 + 50);
    const sw = ctx.measureText(c.speaker).width;
    ctx.font = `400 24px ${FONT_MONO}`;
    ctx.fillStyle = '#6b6560';
    ctx.fillText(`· ${c.tag}`, 52 + sw + 12, y0 + 49);
    // body
    ctx.font = `500 44px ${FONT_SANS}`;
    ctx.fillStyle = '#121212';
    lines.slice(0, 5).forEach((l, i) => ctx.fillText(l, 52, y0 + 104 + i * lineH));
    this.aspect = W / canvas.height;
    this.tex.needsUpdate = true;
    this.mesh.visible = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}

/** Small pill label (hover chip, face source chip). */
export class Chip {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private key = '';
  aspect = 4;

  constructor(name: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 112;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, side: DoubleSide });
    this.mesh = new Mesh(plane, mat);
    this.mesh.name = name;
    this.mesh.renderOrder = 30;
    this.mesh.visible = false;
  }

  set(text: string | null, tone: 'ink' | 'cobalt' | 'pink' = 'ink'): void {
    if (!text) {
      this.mesh.visible = false;
      this.key = '';
      return;
    }
    const key = `${text}|${tone}`;
    this.mesh.visible = true;
    if (key === this.key) return;
    this.key = key;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `500 46px ${FONT_SANS}`;
    const tw = Math.min(canvas.width - 60, ctx.measureText(text).width);
    const w = tw + 64;
    const x = (canvas.width - w) / 2;
    ctx.fillStyle = tone === 'cobalt' ? '#2b4cff' : tone === 'pink' ? '#ff9db0' : '#121212';
    roundRect(ctx, x, 10, w, 92, 46);
    ctx.fill();
    ctx.fillStyle = tone === 'pink' ? '#121212' : '#fff8ec';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, 58, canvas.width - 60);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
