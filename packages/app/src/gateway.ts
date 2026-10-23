/**
 * Client for the Yadori gateway (packages/server). The gateway is the only holder of
 * MODEL_API_KEY; this file never sees a key. Every Meta step can come back as
 * `setup_required`, and the UI shows that instead of pretending.
 */
import type { RoomContext } from '@yadori/room';

export interface ModelStatus {
  ready: boolean;
  model: string;
  setup?: string;
  license?: string;
}

export interface GatewayStatus {
  online: boolean;
  spark?: ModelStatus;
  image?: ModelStatus;
  transcribe?: ModelStatus;
  sam3?: ModelStatus;
  tts?: ModelStatus;
  budget?: { cap_usd: number; spent_usd: number };
  error?: string;
}

export interface Persona {
  name: string;
  temperament: { warmth: number; drama: number; curiosity: number };
  speech_style: string;
  voice: { pitch_semitones: number; rate: number };
  backstory: string;
  face_style: string;
  greeting: string;
}

export interface Sheet {
  expressions: Record<string, string>;
  mouths: Record<string, string>;
}

export interface WakeResult {
  spirit_id: string;
  face: 'built-in' | 'sheet';
  persona: Persona | null;
  sheet: Sheet | null;
  source: 'label' | 'camera';
  /** per-step setup messages when a model could not run */
  setup?: Record<string, string>;
  refused?: string;
}

export type ChatEvent =
  | { type: 'line'; speaker: string; text: string; source: string; to?: string }
  | { type: 'tool'; speaker: string; name: string; args: unknown }
  | { type: 'emote'; speaker: string; expression: string }
  | { type: 'glance'; speaker: string; target: string }
  | { type: 'sleep'; speaker: string }
  | { type: 'done'; latency_ms?: number }
  | { type: 'error'; message: string; setup_required?: string };

const params = new URLSearchParams(location.search);
export const GATEWAY_BASE = (params.get('gateway') ?? '').replace(/\/+$/, '');

async function call<T>(path: string, init?: RequestInit, timeoutMs = 60000): Promise<{ ok: true; data: T } | { ok: false; status: number; body: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${GATEWAY_BASE}${path}`, { ...init, signal: ctl.signal });
    const text = await r.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { error: text.slice(0, 200) };
    }
    if (!r.ok) return { ok: false, status: r.status, body };
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchStatus(): Promise<GatewayStatus> {
  const r = await call<Omit<GatewayStatus, 'online'>>('/api/status', undefined, 6000);
  if (!r.ok) {
    return { online: false, error: r.status === 0 ? 'Gateway offline' : `Gateway error ${r.status}` };
  }
  if ((r.data as { gateway?: string }).gateway === 'offline') return { online: false, error: 'Gateway offline' };
  return { online: true, ...r.data };
}

export async function wake(body: {
  mesh: { id: string; label: string; dims: [number, number, number]; room_context: RoomContext };
  description?: string;
}): Promise<WakeResult | { error: string; status: number }> {
  const r = await call<WakeResult>('/api/wake', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, 180000);
  if (r.ok) return r.data;
  if (r.status === 422 && r.body?.refused) return { ...(r.body as WakeResult), refused: r.body.reason ?? 'refused' };
  return { error: r.body?.error ?? r.body?.message ?? 'wake failed', status: r.status };
}

export async function say(spiritId: string, text: string, voice?: Persona['voice']): Promise<
  { ok: true; wav: ArrayBuffer; model: string } | { ok: false; setup?: string; error: string }
> {
  const r = await call<{ audio: { wav_b64: string }; model: string }>('/api/say', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ spirit_id: spiritId, text, voice }),
  });
  if (!r.ok) return { ok: false, setup: r.body?.setup_required, error: r.body?.message ?? r.body?.error ?? 'say failed' };
  const bin = atob(r.data.audio.wav_b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return { ok: true, wav: buf.buffer, model: r.data.model };
}

/** Streams the conversation turn as server-sent events. */
export async function chat(
  body: { spirit_id: string; text: string; room_context: RoomContext; spirits: { spirit_id: string; name: string; label: string }[] },
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${GATEWAY_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    onEvent({ type: 'error', message: 'Gateway offline' });
    return;
  }
  if (!r.ok || !r.body) {
    let j: any = null;
    try {
      j = await r.json();
    } catch {
      /* not json */
    }
    onEvent({ type: 'error', message: j?.message ?? `chat failed (${r.status})`, setup_required: j?.setup_required });
    return;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as ChatEvent);
      } catch {
        onEvent({ type: 'error', message: 'bad event from gateway' });
      }
    }
  }
}

export async function transcribe(wav: Blob): Promise<{ ok: true; text: string } | { ok: false; setup?: string; error: string }> {
  const r = await call<{ text: string }>('/api/transcribe', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
  if (!r.ok) return { ok: false, setup: r.body?.setup_required, error: r.body?.message ?? r.body?.error ?? 'transcribe failed' };
  return { ok: true, text: r.data.text };
}

export async function forget(spiritId: string): Promise<boolean> {
  const r = await call(`/api/spirits/${encodeURIComponent(spiritId)}`, { method: 'DELETE' });
  return r.ok;
}
