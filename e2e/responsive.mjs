// Landing page and app at 375 px (phone) and 1280 px: no horizontal scroll, key content
// present, the app's phone layout usable (tap the couch -> it wakes). Real Chromium,
// closed in `finally`. Run: node e2e/responsive.mjs  (app dev server on :8091 for the app part)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const network = { responses: 0, errors: [], cases: {} };
function capture(page, label) {
  network.cases[label] = { responses: 0, errors: [] };
  const error = (kind, detail) => { const entry = { at: new Date().toISOString(), label, kind, detail }; network.errors.push(entry); network.cases[label].errors.push(entry); };
  page.on('response', (r) => { network.responses++; network.cases[label].responses++; if (r.status() >= 400) error('http', `${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => error('requestfailed', { url: r.url(), error: r.failure() }));
  page.on('pageerror', (e) => error('pageerror', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') error('console', m.text()); });
}
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
let browser;
try {
  mkdirSync(join(root, 'e2e/shots'), { recursive: true });
  browser = await chromium.launch({ headless: true });
  for (const [w, h] of [[375, 812], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: w === 375 ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    capture(page, `landing-${w}`);
    const errors = [];
    page.on('requestfailed', (r) => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(pathToFileURL(join(root, 'packages/landing/index.html')).href, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.waitForLoadState('load'));
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h1: document.querySelector('h1')?.textContent, imgs: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src) }));
    check(`landing ${w}px: no horizontal scroll`, m.sw <= m.iw, `${m.sw} <= ${m.iw}`);
    check(`landing ${w}px: hero + images load`, /Pinch the couch/.test(m.h1 ?? '') && m.imgs.length === 0, m.imgs.join(','));
    if (w === 375) {
      const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.flip')).animationName);
      check('landing respects reduced motion (card does not flip)', anim === 'none', anim);
    }
    check(`landing ${w}px: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: join(root, `e2e/shots/landing-${w}.png`), fullPage: w === 375 });
    await ctx.close();
  }
  // the app in a phone-sized browser (browser diorama)
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  capture(page, 'app-375');
  const errors = [];
  page.on('requestfailed', (r) => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('https://localhost:8091/', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => localStorage.removeItem('yadori.spirits.v1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__yadori && window.__yadori.targets().length === 5, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check('app 375px: no horizontal scroll', sw.sw <= sw.iw, `${sw.sw} <= ${sw.iw}`);
  const phoneUi = await page.evaluate(() => ({ iwer: !!window.IWER_DEVICE, xrButton: !document.querySelector('#y-xr')?.hidden }));
  check('app on a phone: diorama only (no emulator panel, no XR button)', !phoneUi.iwer && !phoneUi.xrButton, JSON.stringify(phoneUi));
  const couch = (await page.evaluate(() => window.__yadori.targets())).find((t) => t.label === 'couch');
  const pt = await page.evaluate((c) => window.__yadori.toScreen(c), couch.center);
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForFunction(() => window.__yadori.spirits().length === 1, null, { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(2500);
  const n = await page.evaluate(() => window.__yadori.spirits().length);
  check('app 375px: tapping the couch wakes it', n === 1);
  const visible = await page.evaluate(() => {
    const r = document.querySelector('#y-compose')?.getBoundingClientRect();
    return r ? r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight : false;
  });
  check('app 375px: compose strip fits the screen', visible);
  await page.screenshot({ path: join(root, 'e2e/shots/app-375.png') });
  check('app 375px: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
} catch (e) {
  check('responsive run completed', false, e instanceof Error ? e.message : String(e));
} finally {
  await browser?.close();
}
mkdirSync(join(root, 'audit/browser'), { recursive: true });
writeFileSync(join(root, 'audit/browser/responsive-network.json'), JSON.stringify({ ...network, at: new Date().toISOString() }, null, 2));
const fail = results.filter((r) => !r.ok).length;
mkdirSync(join(root, 'e2e/results'), { recursive: true });
writeFileSync(join(root, 'e2e/results/responsive.json'), JSON.stringify({ pass: results.length - fail, fail, results, at: new Date().toISOString() }, null, 2));
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
