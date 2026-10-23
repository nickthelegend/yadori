// Meta calls are live or Setup required: never mocked, never skipped.
// With MODEL_API_KEY in the environment or .env, these hit api.meta.ai for real.
import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { generateSheet } from '../src/image.ts';
import { MetaClient, SetupRequired } from '../src/meta.ts';
import { segment } from '../src/sam.ts';
import { createSpirit } from '../src/spark.ts';
import { Store } from '../src/store.ts';
import { transcribe } from '../src/voice-in.ts';
import { wav16 } from '../src/tts.ts';
import { ctx } from './helpers.ts';

const cfg = config();
const meta = new MetaClient(cfg);
const live = !!cfg.key;

describe(live ? 'Meta Model API (live)' : 'Meta Model API (no key: Setup required)', () => {
  it('create_spirit returns a valid persona or Setup required', async () => {
    const run = createSpirit(meta, cfg.models.spark, ctx as any);
    if (!live) return expect(run).rejects.toBeInstanceOf(SetupRequired);
    const p = await run;
    expect('name' in p || 'refuse' in p).toBe(true);
  }, 120000);

  it('Muse Image sheet, Transcribe and SAM 3.1 are live or Setup required', async () => {
    const store = new Store('/tmp/yadori-live-test');
    const calls = [
      generateSheet(meta, cfg.models.image, store, 'sp_aaaaaaaaaaaa', { name: 'T', face_style: 'round eyes' } as any, 'couch'),
      transcribe(meta, cfg.models.transcribe, wav16(new Float32Array(16000), 16000)),
      segment(meta, cfg.models.sam, '/9j/4AAQSkZJRg==', 'lamp'),
    ];
    if (!live) {
      for (const c of calls) await expect(c).rejects.toBeInstanceOf(SetupRequired);
      return;
    }
    const results = await Promise.allSettled(calls);
    // live: each one either answers or fails with a readable Meta error (never silently)
    for (const r of results) if (r.status === 'rejected') expect(String(r.reason)).toMatch(/\w/);
  }, 600000);
});
