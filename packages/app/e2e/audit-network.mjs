import { chromium } from 'playwright';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP, cli } from './cli.mjs';

// A separate, read-only CDP connection. Reattach for every suite because profile
// changes replace the managed Chrome. No responses or product state are replaced.
export async function captureManaged(name) {
  const dir = join(APP, '../../audit/browser');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}-network.jsonl`);
  const startedAt = new Date().toISOString();
  const status = cli('dev', 'status');
  const browser = await chromium.connectOverCDP(status.state.session.browserAutomation.endpoint);
  const errors = [];
  let responses = 0;
  const log = (kind, data) => {
    const entry = { at: new Date().toISOString(), kind, ...data };
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
    if (kind === 'pageerror' || kind === 'requestfailed'
      || kind === 'console' && data.level === 'error'
      || kind === 'response' && data.status >= 400) errors.push(entry);
  };
  writeFileSync(path, '');
  function observe(page) {
    page.on('console', (m) => { if (m.type() !== 'debug') log('console', { level: m.type(), text: m.text() }); });
    page.on('pageerror', (e) => log('pageerror', { text: String(e) }));
    page.on('requestfailed', (r) => log('requestfailed', { url: r.url(), error: r.failure() }));
    page.on('response', (r) => {
      responses++;
      if (r.status() >= 400 || r.url().includes('/api/') || r.request().resourceType() === 'document') {
        log('response', { url: r.url(), status: r.status(), method: r.request().method() });
      }
    });
  }
  for (const context of browser.contexts()) {
    for (const page of context.pages()) observe(page);
    context.on('page', observe);
  }
  log('capture-start', { suite: name });
  writeFileSync(join(dir, `${name}-network.ready`), startedAt);
  return {
    async stop() {
      await new Promise((r) => setTimeout(r, 150));
      const report = { startedAt, endedAt: new Date().toISOString(), responses, errors };
      log('capture-end', { responses, errorCount: errors.length });
      writeFileSync(join(dir, `${name}-network.json`), JSON.stringify(report, null, 2));
      await browser.close(); // disconnects this CDP client; IWSDK owns Chrome
      return report;
    },
  };
}
