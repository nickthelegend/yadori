/**
 * Voice out: Meta MMS-TTS (facebook/mms-tts-eng, VITS, open weights, CC-BY-NC-4.0), run on
 * the gateway's CPU through transformers.js (ONNX port Xenova/mms-tts-eng). The weights and
 * the runtime are NOT installed by default: scripts/fetch-models.sh installs
 * @huggingface/transformers and downloads the weights into models/ after you accept the
 * licence. Until then status says "Setup required" and the app uses a labelled fallback.
 * Per-spirit voices are a pitch/rate change by resampling one speaker (stated in the README).
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const TTS_MODEL = 'facebook/mms-tts-eng';
export const TTS_PORT = 'Xenova/mms-tts-eng';
export const TTS_LICENSE = 'CC-BY-NC-4.0';
export const TTS_SETUP = 'Setup required: run scripts/fetch-models.sh (MMS-TTS weights, CC-BY-NC-4.0)';

export function weightsPresent(modelsDir: string): boolean {
  const dir = resolve(modelsDir, TTS_PORT, 'onnx');
  try {
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.onnx'));
  } catch {
    return false;
  }
}

let synth: ((text: string) => Promise<{ audio: Float32Array; sampling_rate: number }>) | null = null;
let loadError: string | null = null;

export async function ttsStatus(modelsDir: string): Promise<{ ready: boolean; setup?: string }> {
  if (!weightsPresent(modelsDir)) return { ready: false, setup: TTS_SETUP };
  if (loadError) return { ready: false, setup: loadError };
  return { ready: true };
}

async function load(modelsDir: string) {
  if (synth) return synth;
  try {
    const spec = '@huggingface/transformers';
    const tf: any = await import(spec);
    tf.env.allowRemoteModels = false;
    tf.env.localModelPath = modelsDir;
    const pipe = await tf.pipeline('text-to-speech', TTS_PORT, { dtype: 'q8' });
    synth = async (text: string) => {
      const out = await pipe(text);
      return { audio: out.audio as Float32Array, sampling_rate: out.sampling_rate as number };
    };
    return synth;
  } catch (e) {
    loadError = `${TTS_SETUP}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
    throw new Error(loadError);
  }
}

/** Resample by `factor` (> 1 raises pitch and shortens), linear interpolation. */
export function resample(x: Float32Array, factor: number): Float32Array {
  const n = Math.max(1, Math.floor(x.length / factor));
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * factor;
    const a = Math.floor(p);
    const t = p - a;
    y[i] = (x[a] ?? 0) * (1 - t) + (x[a + 1] ?? x[a] ?? 0) * t;
  }
  return y;
}

export function wav16(samples: Float32Array, rate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

export async function speak(modelsDir: string, text: string, voice?: { pitch_semitones: number; rate: number }): Promise<{ wav: Buffer; seconds: number }> {
  if (!weightsPresent(modelsDir)) throw new Error(TTS_SETUP);
  const fn = await load(modelsDir);
  const { audio, sampling_rate } = await fn(text);
  const factor = Math.pow(2, (voice?.pitch_semitones ?? 0) / 12) * (voice?.rate ?? 1);
  const shaped = Math.abs(factor - 1) > 1e-3 ? resample(audio, factor) : audio;
  return { wav: wav16(shaped, sampling_rate), seconds: shaped.length / sampling_rate };
}
