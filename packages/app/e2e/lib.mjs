// Shared helpers for the browser-mode e2e scripts (run with `iwsdk browser run`).
// Every input is a real mouse or keyboard event on the managed Chromium page; the
// window.__yadori surface is only read for assertions and to find where things are.
export function helpers({ page, frame }) {
  const f = frame;
  const box = async () => (await (await f.frameElement()).boundingBox()) ?? { x: 0, y: 0 };
  const yd = (fn, arg) => f.evaluate(fn, arg);
  const screenOf = async (p) => {
    const b = await box();
    const s = await f.evaluate((c) => window.__yadori.toScreen(c), p);
    return { x: b.x + s.x, y: b.y + s.y };
  };
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    return !!ok;
  };
  return {
    f,
    yd,
    screenOf,
    check,
    results,
    async ready() {
      await f.waitForFunction(() => window.__yadori && window.__yadori.targets().length > 0, null, { timeout: 20000 });
    },
    async clickWorld(p) {
      const s = await screenOf(p);
      await page.mouse.move(s.x, s.y, { steps: 4 });
      await page.waitForTimeout(120);
      await page.mouse.down();
      await page.mouse.up();
    },
    async spirits() {
      return f.evaluate(() => window.__yadori.spirits());
    },
    async face(name) {
      return (await f.evaluate(() => window.__yadori.spirits())).find((s) => s.name === name || s.label === name);
    },
    async stroke(center, size, kind) {
      const c = await screenOf(center);
      const edge = await screenOf([center[0] + size / 2, center[1], center[2]]);
      const r = Math.max(8, Math.abs(edge.x - c.x));
      if (kind === 'poke') {
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.waitForTimeout(60);
        await page.mouse.up();
      } else if (kind === 'flick') {
        await page.mouse.move(c.x - r * 0.9, c.y);
        await page.mouse.down();
        await page.mouse.move(c.x, c.y, { steps: 2 });
        await page.mouse.move(c.x + r * 0.9, c.y, { steps: 2 });
        await page.mouse.up();
      } else {
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        for (let i = 0; i < 30; i++) {
          await page.mouse.move(c.x + Math.sin(i * 0.5) * r * 0.5, c.y + Math.cos(i * 0.9) * r * 0.1);
          await page.waitForTimeout(25);
        }
        await page.mouse.up();
      }
    },
    async type(text) {
      const input = f.locator('#y-text');
      await input.click();
      await input.fill(text);
      await f.locator('#y-send').click();
    },
  };
}
