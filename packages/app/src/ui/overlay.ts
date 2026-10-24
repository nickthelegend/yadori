/**
 * The 2D layer around the 3D stage (browser diorama and emulator; a Quest headset sees
 * only the in-world bubbles and chips): brand + mode, model status pills, the binder of
 * spirit cards, and the compose strip for puppet lines, gossip and talking.
 */
import './overlay.css';
import type { GatewayStatus, Persona } from '../gateway.js';
import { VOICE_LABEL, type VoiceMode } from '../voice.js';

export interface CardData {
  id: string;
  name: string;
  label: string;
  dims: [number, number, number];
  faceSource: 'built-in' | 'sheet';
  faceImage?: string;
  source: 'label' | 'camera';
  persona: Persona | null;
  firstWoke: string;
  memories: number;
  lines: number;
  awake: boolean;
}

export interface OverlayHandlers {
  onSay(speakerId: string, text: string, toId: string | null): void;
  onTalk(spiritId: string, text: string): void;
  onForget(spiritId: string): void;
  onSelect(spiritId: string): void;
  onEnterXR(): void;
  onMic(spiritId: string): void;
}

export const MAX_SPIRITS = 6;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FACE_SVG = `<svg viewBox="0 0 54 54" width="54" height="54" aria-hidden="true"><circle cx="18" cy="24" r="7.5" fill="#fffdf8" stroke="#121212" stroke-width="2.4"/><circle cx="36" cy="24" r="7.5" fill="#fffdf8" stroke="#121212" stroke-width="2.4"/><circle cx="19" cy="25" r="3.4" fill="#121212"/><circle cx="37" cy="25" r="3.4" fill="#121212"/><path d="M20 37 Q27 43 34 37" stroke="#fff8ec" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="11" cy="34" rx="4.5" ry="2.6" fill="#ff9db0"/><ellipse cx="43" cy="34" rx="4.5" ry="2.6" fill="#ff9db0"/></svg>`;

export class Overlay {
  private root: HTMLElement;
  private statusEl!: HTMLElement;
  private modeEl!: HTMLElement;
  private railEl!: HTMLElement;
  private stageEl!: HTMLElement;
  private xrBtn!: HTMLButtonElement;
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private cards: CardData[] = [];
  private selected: string | null = null;
  private gossipTo: string | null = null;
  private status: GatewayStatus = { online: false };
  private voiceMode: VoiceMode = 'silent';
  private hint = '';
  private hintSmall = '';
  private replyTo: string | null = null;
  private naming: { onName: (name: string) => void; onCancel: () => void } | null = null;

  constructor(private h: OverlayHandlers) {
    this.root = document.getElementById('yadori-ui')!;
    this.root.innerHTML = `
      <header class="y-top">
        <div class="y-brand"><div class="mark">${FACE_SVG.replace('width="54" height="54"', 'width="30" height="30"')}</div><b>Yadori</b><span>宿り · wake up your room</span></div>
        <div class="y-mode" id="y-mode"></div>
        <div class="y-status" id="y-status" aria-live="polite"></div>
      </header>
      <aside class="y-rail" id="y-rail" aria-label="Binder of woken spirits"></aside>
      <section class="y-stage" id="y-stage"></section>
      <button class="y-xr" id="y-xr" hidden>Enter mixed reality</button>
      <div class="y-toast" id="y-toast" role="status" hidden></div>`;
    this.statusEl = this.root.querySelector('#y-status')!;
    this.modeEl = this.root.querySelector('#y-mode')!;
    this.railEl = this.root.querySelector('#y-rail')!;
    this.stageEl = this.root.querySelector('#y-stage')!;
    this.xrBtn = this.root.querySelector('#y-xr')!;
    this.toastEl = this.root.querySelector('#y-toast')!;
    this.xrBtn.addEventListener('click', () => this.h.onEnterXR());
    this.statusEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.summary')) this.statusEl.classList.toggle('open');
    });
    this.renderRail();
    this.renderStage();
  }

  /** Hide the 2D layer while a real headset session runs (it would not be visible anyway). */
  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  /** Emulated XR: smaller cards so the room stays visible. */
  setCompact(v: boolean): void {
    this.root.classList.toggle('compact', v);
    // no "Enter mixed reality" while already in it
    this.xrBtn.style.visibility = v ? 'hidden' : '';
  }

  setMode(text: string): void {
    this.modeEl.textContent = text;
  }

  setXRAvailable(v: boolean, label = 'Enter mixed reality'): void {
    this.xrBtn.hidden = !v;
    this.xrBtn.textContent = label;
  }

  toast(text: string, ms = 4200): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  setStatus(s: GatewayStatus, voiceMode: VoiceMode): void {
    this.status = s;
    this.voiceMode = voiceMode;
    const pills: string[] = [];
    let setupCount = 0;
    if (!s.online) {
      pills.push(`<span class="y-pill offline" title="Start it with: pnpm gateway"><i></i>Gateway offline · Meta models unavailable</span>`);
      setupCount++;
    } else {
      const row = (name: string, m?: { ready: boolean; setup?: string; model: string }) => {
        if (!m) return;
        if (!m.ready) setupCount++;
        pills.push(
          `<span class="y-pill${m.ready ? '' : ' setup'}" title="${esc(m.ready ? m.model : m.setup ?? 'Setup required')}"><i></i>${esc(name)} · ${m.ready ? 'ready' : esc(shortSetup(m.setup))}</span>`,
        );
      };
      row('Muse Spark', s.spark);
      row('Muse Image', s.image);
      row('Voice in', s.transcribe);
      row('SAM 3.1', s.sam3);
      row('MMS-TTS', s.tts);
    }
    pills.push(`<span class="y-pill" title="${esc(VOICE_LABEL[voiceMode])}"><i style="background:${voiceMode === 'mms' ? 'var(--cobalt)' : 'var(--pink)'}"></i>Voice out · ${esc(VOICE_LABEL[voiceMode])}</span>`);
    const summary = `<button class="y-pill summary y-status-toggle" aria-label="Show model status"><i style="background:${setupCount ? 'var(--pink)' : 'var(--cobalt)'}"></i>${setupCount ? `Setup required (${setupCount})` : 'All models ready'}</button>`;
    this.statusEl.innerHTML = summary + pills.join('');
    this.renderStage();
  }

  setHint(text: string, small = ''): void {
    this.hint = text;
    this.hintSmall = small;
    this.renderStage();
  }

  setCards(cards: CardData[], selected: string | null): void {
    this.cards = cards;
    if (selected) this.selected = selected;
    if (this.selected && !cards.find((c) => c.id === this.selected)) this.selected = cards[0]?.id ?? null;
    if (!this.selected && cards.length) this.selected = cards[cards.length - 1].id;
    if (this.gossipTo && (!cards.find((c) => c.id === this.gossipTo) || this.gossipTo === this.selected)) this.gossipTo = null;
    this.renderRail();
    this.renderStage();
  }

  /** After a gossip line, the compose strip switches to "reply as <listener>". */
  promptReply(fromId: string, toId: string): void {
    this.selected = toId;
    this.gossipTo = fromId;
    this.replyTo = fromId;
    this.renderRail();
    this.renderStage();
    (this.stageEl.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  /** "Tell me what this is": a one-field form in the stage strip (no blocking prompt). */
  askName(onName: (name: string) => void, onCancel: () => void): void {
    this.naming = { onName, onCancel };
    this.renderStage();
    (this.stageEl.querySelector('#y-name') as HTMLInputElement | null)?.focus();
  }

  get selectedId(): string | null {
    return this.selected;
  }

  private renderRail(): void {
    const filled = this.cards
      .map((c) => {
        const p = c.persona;
        const bars = p
          ? `<div class="y-bars"><span>warmth</span><div class="y-bar"><b style="width:${Math.round(p.temperament.warmth * 100)}%"></b></div><span>drama</span><div class="y-bar"><b style="width:${Math.round(p.temperament.drama * 100)}%"></b></div><span>curiosity</span><div class="y-bar"><b style="width:${Math.round(p.temperament.curiosity * 100)}%"></b></div></div>`
          : `<div class="y-meta">No persona · Setup required for Muse Spark</div>`;
        const face = c.faceImage ? `<img src="${esc(c.faceImage)}" alt="">` : FACE_SVG;
        const voice = p ? `voice ${p.voice.pitch_semitones >= 0 ? '+' : ''}${p.voice.pitch_semitones} st · ${p.voice.rate.toFixed(2)}×` : `voice ${this.voiceMode === 'mms' ? 'MMS default' : this.voiceMode}`;
        return `<article class="y-card${c.id === this.selected ? ' active' : ''}" data-id="${esc(c.id)}" tabindex="0" aria-label="${esc(c.name)}, ${esc(c.label)}">
          <button class="y-forget" data-forget="${esc(c.id)}" aria-label="Forget ${esc(c.name)}">forget</button>
          <div class="row"><div class="face">${face}</div><div><h3>${esc(c.name)}</h3><div class="lbl">${esc(c.label)} · ${c.dims[0].toFixed(1)} × ${c.dims[1].toFixed(1)} m</div></div></div>
          <span class="y-chip${c.faceSource === 'sheet' ? ' cobalt' : ''}">${c.faceSource === 'sheet' ? 'Muse Image face' : 'Built-in face, not generated'}</span><span class="y-chip pink">${c.source === 'camera' ? 'Seen by camera' : 'Drawn from the label'}</span>
          ${bars}
          <div class="y-meta"><span>${esc(voice)}</span><span>${c.memories} memories</span><span>${c.lines} lines</span><span>first woke ${esc(c.firstWoke)}</span>${c.awake ? '' : '<span>asleep · not found in this room</span>'}</div>
        </article>`;
      })
      .join('');
    const empty = Array.from({ length: Math.max(0, MAX_SPIRITS - this.cards.length) }, () => `<div class="y-sleeve">Not awakened yet</div>`).join('');
    this.railEl.innerHTML = `<h2><span>Binder</span><span>${this.cards.length} / ${MAX_SPIRITS}</span></h2>${filled}${empty ? `<div class="y-sleeves">${empty}</div>` : ''}`;
    this.railEl.querySelectorAll<HTMLElement>('.y-card').forEach((el) => {
      el.addEventListener('click', (e) => {
        const f = (e.target as HTMLElement).closest('[data-forget]') as HTMLElement | null;
        if (f) {
          const id = f.dataset.forget!;
          const card = this.cards.find((c) => c.id === id);
          if (card && confirm(`Forget ${card.name}? This deletes its persona, memories and face.`)) this.h.onForget(id);
          return;
        }
        this.selected = el.dataset.id!;
        this.h.onSelect(this.selected);
        this.renderRail();
        this.renderStage();
      });
    });
  }

  private renderStage(): void {
    const awake = this.cards.filter((c) => c.awake);
    const hint = this.hint ? `<div class="y-hint">${esc(this.hint)}${this.hintSmall ? `<small>${esc(this.hintSmall)}</small>` : ''}</div>` : '';
    if (this.naming) {
      const n = this.naming;
      this.stageEl.innerHTML = `<form class="y-compose" id="y-naming" autocomplete="off">
        <div class="y-speakers"><span>Tell me what this is</span></div>
        <div class="y-line"><input id="y-name" maxlength="32" placeholder="for example: coat rack" aria-label="What is this object?" />
        <button class="y-mic" type="button" id="y-name-cancel" aria-label="Cancel">✕</button><button class="y-send" type="submit">Wake it</button></div>
        <div class="y-note">The headset's room scan did not label this one. Its name becomes the label Muse Spark sees.</div></form>`;
      const form = this.stageEl.querySelector<HTMLFormElement>('#y-naming')!;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = (form.querySelector('#y-name') as HTMLInputElement).value;
        this.naming = null;
        n.onName(v);
        this.renderStage();
      });
      form.querySelector('#y-name-cancel')!.addEventListener('click', () => {
        this.naming = null;
        n.onCancel();
        this.renderStage();
      });
      return;
    }
    if (awake.length === 0) {
      this.stageEl.innerHTML = hint;
      return;
    }
    const sel = awake.find((c) => c.id === this.selected) ?? awake[awake.length - 1];
    this.selected = sel.id;
    const spark = !!this.status.spark?.ready && !!sel.persona;
    const others = awake.filter((c) => c.id !== sel.id);
    const speakerBtns = awake
      .map((c) => `<button type="button" data-speaker="${esc(c.id)}" aria-pressed="${c.id === sel.id}">${esc(c.name)}</button>`)
      .join('');
    const gossip = others.length
      ? `<label>${spark ? 'or' : 'to'} <select id="y-to" aria-label="Who it says this to"><option value="">you</option>${others
          .map((c) => `<option value="${esc(c.id)}"${c.id === this.gossipTo ? ' selected' : ''}>${esc(c.name)}</option>`)
          .join('')}</select></label>`
      : '';
    const micReady = !!this.status.transcribe?.ready;
    const placeholder = spark
      ? `Talk to ${sel.name}…`
      : this.replyTo
        ? `Reply as ${sel.name} (you are the voice)…`
        : `Say something as ${sel.name}…`;
    const note = spark
      ? `<b>Muse Spark</b> answers as ${esc(sel.name)} · voice: ${esc(VOICE_LABEL[this.voiceMode])}`
      : `<b>Puppet mode: you are the voice.</b> Setup required for Muse Spark (MODEL_API_KEY). Lines are yours, spoken by ${esc(VOICE_LABEL[this.voiceMode])}.`;
    this.stageEl.innerHTML = `${hint}
      <form class="y-compose" id="y-compose" autocomplete="off">
        <div class="y-speakers"><span>${spark ? 'Talk to' : 'Speaker'}</span>${speakerBtns}${spark ? '' : gossip}</div>
        <div class="y-line">
          <input id="y-text" maxlength="240" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />
          <button class="y-mic" type="button" id="y-mic" ${micReady ? '' : 'disabled'} title="${micReady ? 'Hold to talk (Muse Voice Transcribe)' : 'Setup required: MODEL_API_KEY (Muse Voice Transcribe)'}" aria-label="Talk with your voice">🎙</button>
          <button class="y-send" type="submit" id="y-send">${spark ? 'Talk' : 'Say'}</button>
        </div>
        <div class="y-note">${note}</div>
      </form>`;
    this.stageEl.querySelectorAll<HTMLButtonElement>('[data-speaker]').forEach((b) =>
      b.addEventListener('click', () => {
        this.selected = b.dataset.speaker!;
        this.replyTo = null;
        this.h.onSelect(this.selected);
        this.renderRail();
        this.renderStage();
      }),
    );
    const to = this.stageEl.querySelector<HTMLSelectElement>('#y-to');
    to?.addEventListener('change', () => (this.gossipTo = to.value || null));
    this.stageEl.querySelector('#y-mic')?.addEventListener('click', () => this.h.onMic(sel.id));
    const form = this.stageEl.querySelector<HTMLFormElement>('#y-compose')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector<HTMLInputElement>('#y-text')!;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      if (spark) this.h.onTalk(sel.id, text);
      else {
        const target = this.gossipTo;
        this.replyTo = null;
        this.h.onSay(sel.id, text, target);
      }
    });
  }
}

function shortSetup(s?: string): string {
  if (!s) return 'Setup required';
  if (/MODEL_API_KEY/.test(s)) return 'Setup required: MODEL_API_KEY';
  if (/fetch-models/.test(s)) return 'Setup required: fetch-models';
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}
