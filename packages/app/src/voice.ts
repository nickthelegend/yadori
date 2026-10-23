/**
 * Voice out, in order of preference, each one labelled in the UI:
 *  1. "mms": Meta MMS-TTS (open weights, CC-BY-NC-4.0) synthesised on the gateway; played by
 *     a PositionalAudio at the face so the voice comes from the object; the mouth follows
 *     the audio envelope (AnalyserNode -> 5 mouth shapes).
 *  2. "browser": Web Speech speechSynthesis, "Browser voice, not a Meta model". Not
 *     positional; the mouth follows `boundary` events (coarser).
 *  3. "silent": no voice available; the mouth follows the text timing and the bubble shows
 *     the words. Never a fake audio file.
 * Plus small synthesised sound effects (wake chime, poke boing, pet purr, flick zip),
 * positional at the face.
 */
import { AudioListener, PositionalAudio } from '@iwsdk/core';
import { envelopeToMouth, type FaceRig, lineTimeline, type MouthKey, wordMouthKeys } from '@yadori/rig';
import { type Persona, say as gatewaySay } from './gateway.js';

export type VoiceMode = 'mms' | 'browser' | 'silent';

export const VOICE_LABEL: Record<VoiceMode, string> = {
  mms: 'Meta MMS-TTS (open weights)',
  browser: 'Browser voice, not a Meta model',
  silent: 'No voice: Setup required (MMS-TTS weights)',
};

export interface SpeakHandle {
  mode: VoiceMode;
  /** resolves when the line has finished */
  done: Promise<void>;
}

export interface VoiceTarget {
  id: string;
  rig: FaceRig;
  voiceAudio: PositionalAudio;
  sfxAudio: PositionalAudio;
  voice?: Persona['voice'];
}

export class Voice {
  readonly listener: AudioListener;
  ttsReady = false;
  private analyserData = new Float32Array(1024);
  private freqData = new Uint8Array(512);
  private active: { target: VoiceTarget; analyser: AnalyserNode; started: number; duration: number; onWord?: (n: number) => void; words: number[] } | null = null;
  /** for the lip-sync metric (audio path only) */
  trace: { energy: number[]; mouthOpen: number[] } = { energy: [], mouthOpen: [] };

  constructor() {
    this.listener = new AudioListener();
    this.listener.name = 'YadoriListener';
  }

  get ctx(): AudioContext {
    return this.listener.context;
  }

  /** Call from a user gesture (click, pinch): browsers start audio suspended. */
  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  makeAudio(): PositionalAudio {
    const a = new PositionalAudio(this.listener);
    a.setRefDistance(0.6);
    a.setRolloffFactor(1.2);
    a.setDistanceModel('inverse');
    return a;
  }

  browserVoiceAvailable(): boolean {
    return typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices().length > 0;
  }

  /** The mode the next line would use (for the UI). */
  nextMode(): VoiceMode {
    if (this.ttsReady) return 'mms';
    if (this.browserVoiceAvailable()) return 'browser';
    return 'silent';
  }

  async speak(target: VoiceTarget, text: string, onWord?: (shownWords: number) => void): Promise<SpeakHandle> {
    this.unlock();
    if (this.ttsReady) {
      const r = await gatewaySay(target.id, text, target.voice);
      if (r.ok) {
        try {
          const buffer = await this.ctx.decodeAudioData(r.wav.slice(0));
          return { mode: 'mms', done: this.playBuffer(target, buffer, text, onWord) };
        } catch {
          /* fall through to the next mode */
        }
      }
    }
    if (this.browserVoiceAvailable()) return { mode: 'browser', done: this.speakBrowser(target, text, onWord) };
    return { mode: 'silent', done: this.speakSilent(target, text, onWord) };
  }

  private playBuffer(target: VoiceTarget, buffer: AudioBuffer, text: string, onWord?: (n: number) => void): Promise<void> {
    const a = target.voiceAudio;
    if (a.isPlaying) a.stop();
    a.setBuffer(buffer);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    a.getOutput().connect(analyser);
    const tl = lineTimeline(text);
    const scale = buffer.duration / Math.max(0.3, tl.duration);
    const words = tl.words.map((w) => w.t * scale);
    this.active = { target, analyser, started: this.ctx.currentTime, duration: buffer.duration, onWord, words };
    this.trace = { energy: [], mouthOpen: [] };
    a.play();
    return new Promise((resolve) => {
      const src = a.source as AudioBufferSourceNode | null;
      if (src) src.onended = () => {
        target.rig.setEnvelopeShape(null);
        onWord?.(words.length);
        try {
          a.getOutput().disconnect(analyser);
        } catch {
          /* already disconnected */
        }
        if (this.active?.target === target) this.active = null;
        resolve();
      };
    });
  }

  private speakBrowser(target: VoiceTarget, text: string, onWord?: (n: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const v = target.voice;
      u.pitch = Math.max(0.1, Math.min(2, Math.pow(2, (v?.pitch_semitones ?? 0) / 12)));
      u.rate = Math.max(0.5, Math.min(1.6, v?.rate ?? 1));
      const words = text.split(/\s+/).filter(Boolean);
      let boundaries = 0;
      const tl = lineTimeline(text, 165 * u.rate);
      const fallback = setTimeout(() => {
        if (boundaries === 0) {
          target.rig.speak(tl.keys, tl.duration);
          tl.words.forEach((w, i) => setTimeout(() => onWord?.(i + 1), w.t * 1000));
        }
      }, 450);
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        boundaries++;
        let idx = 0;
        let pos = 0;
        for (let i = 0; i < words.length; i++) {
          const at = text.indexOf(words[i], pos);
          if (at > e.charIndex) break;
          idx = i;
          pos = at + words[i].length;
        }
        const w = words[idx] ?? '';
        const dur = Math.max(0.15, (w.length / 5) * (60 / (165 * u.rate)));
        const keys: MouthKey[] = wordMouthKeys(w, 0, dur);
        target.rig.speak(keys, dur);
        onWord?.(idx + 1);
      };
      u.onend = u.onerror = () => {
        clearTimeout(fallback);
        onWord?.(words.length);
        resolve();
      };
      speechSynthesis.speak(u);
    });
  }

  private speakSilent(target: VoiceTarget, text: string, onWord?: (n: number) => void): Promise<void> {
    const tl = lineTimeline(text, 165 * (target.voice?.rate ?? 1));
    target.rig.speak(tl.keys, tl.duration);
    const timers = tl.words.map((w, i) => setTimeout(() => onWord?.(i + 1), w.t * 1000));
    return new Promise((resolve) =>
      setTimeout(() => {
        timers.forEach(clearTimeout);
        onWord?.(tl.words.length);
        resolve();
      }, tl.duration * 1000 + 100),
    );
  }

  /** Per frame: drive the speaking face's mouth from the audio envelope. */
  update(): void {
    const a = this.active;
    if (!a) return;
    a.analyser.getFloatTimeDomainData(this.analyserData);
    let sum = 0;
    for (let i = 0; i < this.analyserData.length; i++) sum += this.analyserData[i] * this.analyserData[i];
    const rms = Math.sqrt(sum / this.analyserData.length);
    const energy = Math.min(1, rms * 4);
    a.analyser.getByteFrequencyData(this.freqData);
    let num = 0;
    let den = 0;
    for (let i = 0; i < this.freqData.length; i++) {
      num += i * this.freqData[i];
      den += this.freqData[i];
    }
    const centroid = den > 0 ? num / den / this.freqData.length : 0;
    a.target.rig.setEnvelopeShape(envelopeToMouth(energy, centroid));
    this.trace.energy.push(energy);
    this.trace.mouthOpen.push(a.target.rig.params.mouthOpen);
    const t = this.ctx.currentTime - a.started;
    let shown = 0;
    while (shown < a.words.length && a.words[shown] <= t) shown++;
    a.onWord?.(shown);
  }

  /** Short synthesised effects, positional at the face. */
  sfx(target: VoiceTarget, kind: 'wake' | 'poke' | 'pet' | 'flick' | 'sleep'): void {
    if (this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const out = target.sfxAudio.getOutput();
    const now = ctx.currentTime;
    const tone = (f0: number, f1: number, t0: number, dur: number, type: OscillatorType, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + t0 + dur);
      g.gain.setValueAtTime(0.0001, now + t0);
      g.gain.exponentialRampToValueAtTime(vol, now + t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
      o.connect(g).connect(out);
      o.start(now + t0);
      o.stop(now + t0 + dur + 0.05);
    };
    switch (kind) {
      case 'wake':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, f * 1.002, i * 0.09, 0.6, 'sine', 0.18));
        break;
      case 'poke':
        tone(320, 120, 0, 0.22, 'sine', 0.35);
        tone(640, 900, 0.05, 0.12, 'triangle', 0.1);
        break;
      case 'pet':
        for (let i = 0; i < 6; i++) tone(90 + (i % 2) * 8, 85, i * 0.11, 0.1, 'sawtooth', 0.04);
        tone(880, 1320, 0.1, 0.35, 'sine', 0.08);
        break;
      case 'flick':
        tone(1400, 300, 0, 0.18, 'triangle', 0.2);
        break;
      case 'sleep':
        tone(523.25, 261.6, 0, 0.8, 'sine', 0.12);
        break;
    }
  }
}
