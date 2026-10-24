/**
 * One HTTP client for the Meta Model API (https://api.meta.ai/v1). OpenAI-compatible for
 * Chat Completions and Images; its own shapes for Voice Transcribe and SAM 3.1.
 * Without a key every call throws SetupRequired; nothing is ever invented.
 */
import { randomUUID } from 'node:crypto';
import { type Config, SETUP_KEY } from './config.ts';
import { logRun } from './runlog.ts';

export class SetupRequired extends Error {
  what: string;
  constructor(what: string, message = SETUP_KEY) {
    super(message);
    this.what = what;
  }
}

export class MetaError extends Error {
  status: number;
  code: string;
  requestId: string | null;
  constructor(status: number, code: string, message: string, requestId: string | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface CallOpts {
  kind: string;
  model: string;
  timeoutMs?: number;
  retries?: number;
  costUsd?: (body: any) => number;
}

export class MetaClient {
  private cfg: Config;
  constructor(cfg: Config) {
    this.cfg = cfg;
  }

  get ready(): boolean {
    return !!this.cfg.key;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.cfg.key) throw new SetupRequired('MODEL_API_KEY');
    return { authorization: `Bearer ${this.cfg.key}`, 'x-client-request-id': randomUUID(), ...extra };
  }

  /** POST JSON with retries on 429/503 (exponential backoff). */
  async json<T = any>(path: string, body: unknown, opts: CallOpts): Promise<T> {
    return this.send<T>(path, () => ({ body: JSON.stringify(body), headers: this.headers({ 'content-type': 'application/json' }) }), opts);
  }

  /** POST multipart form data. */
  async form<T = any>(path: string, make: () => FormData, opts: CallOpts): Promise<T> {
    return this.send<T>(path, () => ({ body: make(), headers: this.headers() }), opts);
  }

  private async send<T>(path: string, make: () => { body: string | FormData; headers: Record<string, string> }, opts: CallOpts): Promise<T> {
    const retries = opts.retries ?? 2;
    let attempt = 0;
    for (;;) {
      const { body, headers } = make();
      const t0 = performance.now();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 90000);
      let res: Response;
      try {
        res = await fetch(`${this.cfg.base}${path}`, { method: 'POST', body, headers, signal: ctl.signal });
      } catch (e) {
        clearTimeout(timer);
        logRun({ kind: opts.kind, model: opts.model, ok: false, latency_ms: Math.round(performance.now() - t0), error: 'network' });
        throw new MetaError(0, 'network', `Meta API unreachable: ${e instanceof Error ? e.message : String(e)}`, null);
      }
      clearTimeout(timer);
      const latency = Math.round(performance.now() - t0);
      const requestId = res.headers.get('x-request-id') ?? res.headers.get('request-id');
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text.slice(0, 500) };
      }
      if (res.ok) {
        const cost = opts.costUsd ? opts.costUsd(data) : 0;
        logRun({ kind: opts.kind, model: opts.model, ok: true, latency_ms: latency, request_id: requestId, cost_usd: cost });
        return data as T;
      }
      const code = data?.error?.code ?? data?.error?.type ?? `http_${res.status}`;
      const message = data?.error?.message ?? `Meta API error ${res.status}`;
      logRun({ kind: opts.kind, model: opts.model, ok: false, latency_ms: latency, request_id: requestId, error: code });
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
        continue;
      }
      throw new MetaError(res.status, String(code), String(message), requestId);
    }
  }
}
