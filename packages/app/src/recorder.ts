/**
 * Push-to-talk recorder: microphone -> 16 kHz mono 16-bit WAV, the format Muse Voice
 * Transcribe's file endpoint takes. Only used when the gateway reports transcribe ready.
 */
export async function recordWav(maxSeconds = 15): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc);
  proc.connect(ctx.destination);
  let stopped = false;
  const finish = async (): Promise<Blob> => {
    if (!stopped) {
      stopped = true;
      proc.disconnect();
      src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    }
    return encodeWav(chunks, ctx.sampleRate, 16000);
  };
  const timer = setTimeout(() => void finish(), maxSeconds * 1000);
  return {
    stop: () => {
      clearTimeout(timer);
      return finish();
    },
  };
}

export function encodeWav(chunks: Float32Array[], inRate: number, outRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const ratio = inRate / outRate;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  let ci = 0;
  let off = 0;
  const flat = new Float32Array(total);
  for (const c of chunks) {
    flat.set(c, off);
    off += c.length;
  }
  for (let i = 0; i < outLen; i++) {
    // box-filter downsample
    const a = Math.floor(i * ratio);
    const b = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (ci = a; ci < b; ci++) sum += flat[ci];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.byteLength, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true);
  dv.setUint32(28, outRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}
