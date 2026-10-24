// The gateway as a real process (node strips the TypeScript types itself): it must start,
// answer /api/status and stop cleanly.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

it('starts with `node src/main.ts` and serves status without a key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yadori-proc-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const p = spawn(process.execPath, [resolve(here, '../src/main.ts')], {
    env: { ...process.env, YADORI_PORT: String(port), YADORI_ENV_FILE: join(dir, 'none.env'), MODEL_API_KEY: '', YADORI_DATA_DIR: dir, YADORI_NO_RUNLOG: '1' },
  });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  try {
    for (let i = 0; i < 50 && !out.includes('gateway on'); i++) await new Promise((r) => setTimeout(r, 100));
    expect(out).toContain('Meta key: missing (Setup required)');
    const s = (await (await fetch(`http://127.0.0.1:${port}/api/status`)).json()) as any;
    expect(s.gateway).toBe('yadori');
    expect(s.spark.ready).toBe(false);
  } finally {
    p.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
});
