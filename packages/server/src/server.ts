/**
 * The Yadori gateway (default port 8440). The only process that holds MODEL_API_KEY.
 *   GET    /api/status
 *   POST   /api/wake        {mesh:{id,label,dims,room_context}, description?, crop_jpeg?}
 *   POST   /api/chat        {spirit_id, text, room_context, spirits}  -> text/event-stream
 *   POST   /api/say         {spirit_id, text, voice?}                 -> {audio:{wav_b64}}
 *   POST   /api/transcribe  audio/wav body                           -> {text}
 *   POST   /api/cut         {frame_jpeg, label}                       -> {candidates, person_overlap}
 *   GET    /api/spirits     DELETE /api/spirits/:id     GET /api/spirits/:id/sheet/:name
 * Without the key: wake answers with the built-in face and a `setup` map; every other Meta
 * step is 503 {setup_required: "MODEL_API_KEY"}. Never a canned answer.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import type { RoomContext } from '@yadori/room';
import { type Config, ROOT, SETUP_KEY } from './config.ts';
import { SHEET_IMAGES, generateSheet } from './image.ts';
import { MetaClient, MetaError, SetupRequired } from './meta.ts';
import { BudgetExceeded, PRICES, assertBudget, spent } from './runlog.ts';
import { boxOverlap, segment } from './sam.ts';
import { type Persona, type SpiritView, type TalkEvent, TurnBudget, createSpirit, talkTurn } from './spark.ts';
import { Store } from './store.ts';
import { TTS_LICENSE, TTS_MODEL, speak, ttsStatus } from './tts.ts';
import { transcribe } from './voice-in.ts';

const MAX_BODY = 12 * 1024 * 1024;

class HttpError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(String(body.message ?? body.error ?? status));
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > MAX_BODY) throw new HttpError(413, { error: 'body too large' });
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const b = await readBody(req);
  try {
    return JSON.parse(b.toString('utf8')) as T;
  } catch {
    throw new HttpError(400, { error: 'body is not JSON' });
  }
}

const setupRequired = (what: string) => new HttpError(503, { setup_required: 'MODEL_API_KEY', step: what, message: SETUP_KEY });

/** Small per-IP token bucket (60 requests / minute). */
class RateLimit {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private perMinute = 60) {}
  take(ip: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(ip) ?? { tokens: this.perMinute, at: now };
    b.tokens = Math.min(this.perMinute, b.tokens + ((now - b.at) / 60000) * this.perMinute);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(ip, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(ip, b);
    return true;
  }
}

export function makeServer(cfg: Config) {
  const meta = new MetaClient(cfg);
  const store = new Store(cfg.dataDir);
  const history = new Map<string, { role: 'user' | 'assistant'; content: string }[]>();
  const limit = new RateLimit(Number(process.env.YADORI_RATE_PER_MIN ?? 60));
  const staticRoot = resolve(ROOT, 'packages/app/dist');

  const modelStatus = (model: string) => (cfg.key ? { ready: true, model } : { ready: false, model, setup: SETUP_KEY });

  async function status() {
    const tts = await ttsStatus(cfg.modelsDir);
    return {
      gateway: 'yadori',
      spark: modelStatus(cfg.models.spark),
      wonder: modelStatus(cfg.models.wonder),
      image: modelStatus(cfg.models.image),
      transcribe: modelStatus(cfg.models.transcribe),
      sam3: modelStatus(cfg.models.sam),
      tts: { ...tts, model: TTS_MODEL, license: TTS_LICENSE },
      budget: { cap_usd: cfg.dailyCapUsd, spent_usd: Math.round(spent() * 10000) / 10000 },
    };
  }

  async function wake(body: { mesh?: { id?: string; label?: string; dims?: number[]; room_context?: RoomContext }; description?: string; crop_jpeg?: string }) {
    const m = body.mesh;
    if (!m || typeof m.label !== 'string' || !m.label.trim() || !Array.isArray(m.dims) || m.dims.length !== 3 || !m.room_context)
      throw new HttpError(400, { error: 'mesh {label, dims[3], room_context} required' });
    const label = m.label.trim().toLowerCase().slice(0, 32);
    const dims = m.dims.map((x) => Number(x)) as [number, number, number];
    const id = store.newId();
    const source: 'label' | 'camera' = body.crop_jpeg ? 'camera' : 'label';
    if (!cfg.key) {
      store.create({ spirit_id: id, label, dims, face: 'built-in', source, created: new Date().toISOString() }, null);
      return { status: 200, body: { spirit_id: id, face: 'built-in', persona: null, sheet: null, source, setup: { spark: SETUP_KEY, image: SETUP_KEY } } };
    }
    assertBudget(cfg.dailyCapUsd, 0.01 + SHEET_IMAGES * PRICES.image);
    const desc = typeof body.description === 'string' ? body.description.slice(0, 200) : undefined;
    const crop = typeof body.crop_jpeg === 'string' ? `data:image/jpeg;base64,${body.crop_jpeg}` : undefined;
    const persona = await createSpirit(meta, cfg.models.spark, m.room_context, desc, crop);
    if ('refuse' in persona) return { status: 422, body: { refused: true, reason: persona.refuse } };
    store.create({ spirit_id: id, label, dims, face: 'built-in', source, created: new Date().toISOString() }, persona);
    const setup: Record<string, string> = {};
    let sheet = null;
    try {
      sheet = await generateSheet(meta, cfg.models.image, store, id, persona, label);
      const meta0 = store.meta(id)!;
      store.create({ ...meta0, face: 'sheet' }, persona);
    } catch (e) {
      // e.g. 400 content_policy_violation: keep the persona, use the built-in face, say why
      setup.image = e instanceof MetaError ? `Muse Image: ${e.code}: ${e.message}` : `Muse Image: ${e instanceof Error ? e.message : String(e)}`;
    }
    return { status: 200, body: { spirit_id: id, face: sheet ? 'sheet' : 'built-in', persona, sheet, source, ...(Object.keys(setup).length ? { setup } : {}) } };
  }

  async function chat(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson<{ spirit_id?: string; text?: string; room_context?: RoomContext; spirits?: SpiritView[] }>(req);
    if (!cfg.key) throw setupRequired('spark');
    if (!body.spirit_id || !store.exists(body.spirit_id)) throw new HttpError(404, { error: 'unknown spirit (woken without the gateway?)' });
    if (!store.persona(body.spirit_id)) throw new HttpError(409, { error: 'this spirit has no persona (it was woken without Muse Spark); wake it again' });
    if (typeof body.text !== 'string' || !body.text.trim()) throw new HttpError(400, { error: 'text required' });
    assertBudget(cfg.dailyCapUsd, 0.01);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const emit = (e: TalkEvent | { type: 'done'; latency_ms: number }) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    const t0 = performance.now();
    const all = (body.spirits ?? []).filter((s) => typeof s?.spirit_id === 'string' && store.exists(s.spirit_id));
    const self = all.find((s) => s.spirit_id === body.spirit_id) ?? { spirit_id: body.spirit_id, name: store.persona(body.spirit_id)!.name, label: store.meta(body.spirit_id)!.label };
    try {
      await talkTurn(
        {
          meta,
          model: cfg.models.spark,
          persona: (id) => store.persona(id),
          memories: (id) => store.memories(id),
          remember: (id, f) => store.remember(id, f),
          history,
        },
        self,
        all,
        body.room_context ?? ({} as RoomContext),
        { from: 'user', text: body.text.trim().slice(0, 500) },
        emit,
        new TurnBudget(),
      );
    } catch (e) {
      emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
    emit({ type: 'done', latency_ms: Math.round(performance.now() - t0) });
    res.end();
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;
    const ip = req.socket.remoteAddress ?? 'local';
    if (path.startsWith('/api/') && path !== '/api/status' && !limit.take(ip)) throw new HttpError(429, { error: 'slow down (rate limit)' });
    if (req.method === 'GET' && path === '/api/status') return send(res, 200, await status());
    if (req.method === 'POST' && path === '/api/wake') {
      const r = await wake(await readJson(req));
      return send(res, r.status, r.body);
    }
    if (req.method === 'POST' && path === '/api/chat') return chat(req, res);
    if (req.method === 'POST' && path === '/api/say') {
      const b = await readJson<{ spirit_id?: string; text?: string; voice?: Persona['voice'] }>(req);
      if (typeof b.text !== 'string' || !b.text.trim()) throw new HttpError(400, { error: 'text required' });
      const st = await ttsStatus(cfg.modelsDir);
      if (!st.ready) throw new HttpError(503, { setup_required: 'mms-tts', message: st.setup });
      const out = await speak(cfg.modelsDir, b.text.slice(0, 400), b.voice);
      return send(res, 200, { audio: { wav_b64: out.wav.toString('base64'), seconds: out.seconds }, model: TTS_MODEL, license: TTS_LICENSE, source: 'puppet' });
    }
    if (req.method === 'POST' && path === '/api/transcribe') {
      const wav = await readBody(req);
      if (!cfg.key) throw setupRequired('transcribe');
      return send(res, 200, { text: await transcribe(meta, cfg.models.transcribe, wav), model: cfg.models.transcribe });
    }
    if (req.method === 'POST' && path === '/api/cut') {
      const b = await readJson<{ frame_jpeg?: string; label?: string }>(req);
      if (!cfg.key) throw setupRequired('sam3');
      if (typeof b.frame_jpeg !== 'string' || typeof b.label !== 'string') throw new HttpError(400, { error: 'frame_jpeg and label required' });
      // the frame stays in memory: it is never written to disk
      const [objects, people] = await Promise.all([segment(meta, cfg.models.sam, b.frame_jpeg, b.label), segment(meta, cfg.models.sam, b.frame_jpeg, 'person')]);
      const person_overlap = objects.some((o) => people.some((p) => boxOverlap(o.box, p.box) > 0.05));
      return send(res, 200, { candidates: person_overlap ? [] : objects.map((o) => ({ bbox: o.box, score: o.score, mask_raw: o.mask_raw })), person_overlap });
    }
    if (req.method === 'GET' && path === '/api/spirits') return send(res, 200, { spirits: store.list() });
    const sheet = /^\/api\/spirits\/(sp_[a-z0-9]{12})\/sheet\/([a-z0-9_-]{1,32}\.png)$/.exec(path);
    if (req.method === 'GET' && sheet) {
      let f: string;
      try {
        f = store.sheetFile(sheet[1], sheet[2]);
      } catch {
        throw new HttpError(404, { error: 'not found' });
      }
      if (!existsSync(f)) throw new HttpError(404, { error: 'not found' });
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' });
      return void createReadStream(f).pipe(res);
    }
    const del = /^\/api\/spirits\/([^/]+)$/.exec(path);
    if (req.method === 'DELETE' && del) {
      history.delete(del[1]);
      return send(res, store.forget(del[1]) ? 200 : 404, { forgotten: del[1] });
    }
    if (path.startsWith('/api/')) throw new HttpError(404, { error: 'no such endpoint' });
    // the built app (pnpm build), so one origin serves app + API for local use
    if (req.method === 'GET' && existsSync(staticRoot)) {
      const rel = decodeURIComponent(path === '/' ? '/index.html' : path);
      const file = resolve(staticRoot, `.${rel}`);
      if (!file.startsWith(staticRoot)) throw new HttpError(403, { error: 'forbidden' });
      if (existsSync(file) && statSync(file).isFile()) {
        const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.glts': 'text/plain', '.wasm': 'application/wasm' };
        res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
        return void createReadStream(file).pipe(res);
      }
    }
    throw new HttpError(404, { error: 'not found' });
  }

  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          /* closed */
        }
        return;
      }
      if (e instanceof HttpError) return send(res, e.status, e.body);
      if (e instanceof SetupRequired) return send(res, 503, { setup_required: 'MODEL_API_KEY', message: e.message });
      if (e instanceof BudgetExceeded) return send(res, 429, { error: e.message });
      if (e instanceof MetaError) return send(res, e.status >= 400 && e.status < 600 ? e.status : 502, { error: e.code, message: e.message, request_id: e.requestId });
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    });
  });
}
