import { config } from './config.ts';
import { makeServer } from './server.ts';

const cfg = config();
const server = makeServer(cfg);
server.listen(cfg.port, '127.0.0.1', () => {
  console.log(`[yadori] gateway on http://127.0.0.1:${cfg.port} · Meta key: ${cfg.key ? 'set' : 'missing (Setup required)'}`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => process.exit(0)));
