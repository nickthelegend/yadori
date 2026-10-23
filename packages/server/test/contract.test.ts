// Gateway HTTP contract without MODEL_API_KEY: every Meta step says "Setup required",
// wake still works with the built-in face, and the key never leaves the gateway.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, startGateway } from './helpers.ts';

let gw: Awaited<ReturnType<typeof startGateway>>;
beforeAll(async () => {
  gw = await startGateway();
});
afterAll(async () => gw.close());

const post = (path: string, body: unknown, type = 'application/json') =>
  fetch(`${gw.url}${path}`, { method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' || body instanceof Uint8Array ? (body as any) : JSON.stringify(body) });

describe('no key', () => {
  it('status lists every Meta model as Setup required and MMS-TTS as needing fetch-models', async () => {
    const s = await (await fetch(`${gw.url}/api/status`)).json() as any;
    for (const k of ['spark', 'wonder', 'image', 'transcribe', 'sam3']) {
      expect(s[k].ready).toBe(false);
      expect(s[k].setup).toMatch(/MODEL_API_KEY/);
    }
    expect(s.spark.model).toBe('muse-spark-1.3');
    expect(s.tts).toMatchObject({ ready: false, model: 'facebook/mms-tts-eng', license: 'CC-BY-NC-4.0' });
    expect(s.tts.setup).toMatch(/fetch-models/);
    expect(s.budget.cap_usd).toBeGreaterThan(0);
  });

  it('wake answers with the built-in face, no persona, and says why', async () => {
    const r = await post('/api/wake', { mesh: { id: 'den-couch', label: 'Couch', dims: [2, 0.86, 0.9], room_context: ctx } });
    expect(r.status).toBe(200);
    const b = await r.json() as any;
    expect(b.spirit_id).toMatch(/^sp_[a-z0-9]{12}$/);
    expect(b).toMatchObject({ face: 'built-in', persona: null, sheet: null, source: 'label' });
    expect(b.setup.spark).toMatch(/MODEL_API_KEY/);
    expect(existsSync(join(gw.cfg.dataDir, 'spirits', b.spirit_id, 'meta.json'))).toBe(true);
  });

  it('wake rejects a malformed mesh', async () => {
    expect((await post('/api/wake', { mesh: { label: 'couch' } })).status).toBe(400);
    expect((await post('/api/wake', 'not json')).status).toBe(400);
  });

  it('chat, transcribe and cut are 503 setup_required', async () => {
    for (const [path, body, type] of [
      ['/api/chat', { spirit_id: 'sp_aaaaaaaaaaaa', text: 'hi' }, 'application/json'],
      ['/api/transcribe', new Uint8Array(64), 'audio/wav'],
      ['/api/cut', { frame_jpeg: 'AAAA', label: 'lamp' }, 'application/json'],
    ] as const) {
      const r = await post(path, body, type);
      expect(r.status, path).toBe(503);
      expect(((await r.json()) as any).setup_required).toBe('MODEL_API_KEY');
    }
  });

  it('say without MMS-TTS weights is 503 with the fetch-models instruction', async () => {
    const r = await post('/api/say', { spirit_id: 'x', text: 'hello' });
    expect(r.status).toBe(503);
    const b = await r.json() as any;
    expect(b.setup_required).toBe('mms-tts');
    expect(b.message).toMatch(/fetch-models/);
  });

  it('lists spirits and forget deletes everything about one', async () => {
    const w = await (await post('/api/wake', { mesh: { id: 'den-lamp', label: 'lamp', dims: [0.44, 1.7, 0.44], room_context: ctx } })).json() as any;
    const list = await (await fetch(`${gw.url}/api/spirits`)).json() as any;
    expect(list.spirits.map((s: { spirit_id: string }) => s.spirit_id)).toContain(w.spirit_id);
    const d = await fetch(`${gw.url}/api/spirits/${w.spirit_id}`, { method: 'DELETE' });
    expect(d.status).toBe(200);
    expect(existsSync(join(gw.cfg.dataDir, 'spirits', w.spirit_id))).toBe(false);
    expect((await fetch(`${gw.url}/api/spirits/${w.spirit_id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('refuses path tricks and unknown endpoints', async () => {
    expect((await fetch(`${gw.url}/api/spirits/sp_aaaaaaaaaaaa/sheet/..%2F..%2Fmeta.json`)).status).toBe(404);
    expect((await fetch(`${gw.url}/api/spirits/../../package.json`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${gw.url}/api/nope`)).status).toBe(404);
  });
});

describe('with a key configured (no network call is made by these endpoints)', () => {
  it('never echoes the key', async () => {
    const secret = 'yadori-test-value-not-a-real-key-123';
    const g = await startGateway({ key: secret });
    try {
      const text = await (await fetch(`${g.url}/api/status`)).text();
      expect(text).not.toContain(secret);
      expect(JSON.parse(text).spark.ready).toBe(true);
      const bad = await fetch(`${g.url}/api/wake`, { method: 'POST', body: '{}' });
      expect(await bad.text()).not.toContain(secret);
    } finally {
      await g.close();
    }
  });

  it('rate-limits a single client', async () => {
    process.env.YADORI_RATE_PER_MIN = '3';
    const g = await startGateway();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await fetch(`${g.url}/api/spirits`)).status);
      expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
      expect(codes).toContain(429);
    } finally {
      delete process.env.YADORI_RATE_PER_MIN;
      await g.close();
    }
  });
});
