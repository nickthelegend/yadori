/**
 * Muse Voice Transcribe, file endpoint: POST /v1/asr/transcribe with a WAV (mono 16-bit PCM,
 * 16 or 24 kHz, ≤ 32 MB, ≤ 10 min per the docs). UNVERIFIED until a key exists: the
 * multipart field names (`file`, `model`) and the response field (`text`).
 * The realtime socket (wss://api.meta.ai/v1/asr/realtime, key in the first frame) is the
 * next step; the browser never opens it, only the gateway would.
 */
import { type MetaClient, SetupRequired } from './meta.ts';
import { PRICES } from './runlog.ts';

export function wavSeconds(wav: Buffer): number {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  const rate = wav.readUInt32LE(24);
  const bits = wav.readUInt16LE(34);
  const ch = wav.readUInt16LE(22);
  if (ch !== 1 || bits !== 16 || (rate !== 16000 && rate !== 24000)) throw new Error('WAV must be mono 16-bit PCM at 16 or 24 kHz');
  return (wav.length - 44) / (rate * 2);
}

export async function transcribe(meta: MetaClient, model: string, wav: Buffer): Promise<string> {
  if (!meta.ready) throw new SetupRequired('transcribe');
  const secs = wavSeconds(wav);
  if (secs > 600) throw new Error('audio longer than 10 minutes');
  const data = await meta.form(
    '/asr/transcribe',
    () => {
      const fd = new FormData();
      fd.set('model', model);
      fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
      return fd;
    },
    { kind: 'transcribe.file', model, costUsd: () => (secs / 3600) * PRICES.transcribeHour },
  );
  const text = data?.text ?? data?.transcript ?? data?.results?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Muse Voice Transcribe returned no text field');
  return text;
}
