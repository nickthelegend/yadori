import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { type Config, config } from '../src/config.ts';
import { makeServer } from '../src/server.ts';

process.env.YADORI_NO_RUNLOG = '1';

export async function startGateway(overrides: Partial<Config> = {}): Promise<{ url: string; cfg: Config; close: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'yadori-gw-'));
  const cfg: Config = { ...config(), key: null, dataDir: join(dir, 'data'), modelsDir: join(dir, 'models'), runsDir: join(dir, 'runs'), ...overrides };
  const server: Server = makeServer(cfg);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    cfg,
    close: () =>
      new Promise((r) =>
        server.close(() => {
          rmSync(dir, { recursive: true, force: true });
          r();
        }),
      ),
  };
}

export const ctx = {
  self: { id: 'den-couch', label: 'couch', dims_m: [2, 0.86, 0.9], height_of_top_m: 0.86 },
  viewer: { distance_m: 3.1, eye_height_m: 1.6 },
  neighbours: [{ label: 'lamp', distance_m: 1.62, side: 'left', awake: false }],
  room: { object_count: 5, labels: ['couch', 'lamp', 'plant', 'screen', 'table'] },
  local_time: '19:40',
  source: 'label',
};
