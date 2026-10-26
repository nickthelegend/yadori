import { captureManaged } from './audit-network.mjs';
// The CLI reports successful script execution even when script assertions fail.
// Make the package command fail on those assertions and persist startup errors too.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, cli } from './cli.mjs';

let summary;
let capture;
try {
  capture = await captureManaged('browser');
  summary = cli('browser', 'run', 'e2e/browser-diorama.mjs', '--timeout', '110000');
  if (!Array.isArray(summary?.results) || !Number.isInteger(summary.pass) || !Number.isInteger(summary.fail)) {
    throw new Error(`Browser suite returned no complete test summary: ${JSON.stringify(summary).slice(0, 500)}`);
  }
} catch (error) {
  summary = {
    mode: 'browser diorama (no headset), real mouse + keyboard',
    pass: 0,
    fail: 1,
    results: [{ name: 'browser suite completed', ok: false, detail: error instanceof Error ? error.message : String(error) }],
    at: new Date().toISOString(),
  };
}
if (capture) {
  const network = await capture.stop();
  const ok = network.responses > 0 && network.errors.length === 0;
  summary.results.push({ name: 'independent console, page and network capture is clean', ok, detail: `${network.responses} responses; ${network.errors.length} errors` });
  if (ok) summary.pass++; else summary.fail++;
}
mkdirSync(join(APP, 'e2e/results'), { recursive: true });
writeFileSync(join(APP, 'e2e/results/browser-diorama.json'), JSON.stringify(summary, null, 2));
for (const { name, ok, detail } of summary.results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
process.exitCode = summary.fail ? 1 : 0;
