import { helpers } from './lib.mjs';
// Browser mode (no headset) clip, choreographed with the real mouse and keyboard while a
// CDP screencast records the whole page. Frames go to e2e/.rec/diorama/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function run(ctx) {
  const { page, cdp, workspaceRoot } = ctx;
  const h = helpers(ctx);
  const { f } = h;
  const dir = join(workspaceRoot, 'e2e', '.rec', 'diorama');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await f.evaluate(() => localStorage.removeItem('yadori.spirits.v1'));
  await f.evaluate(() => location.reload());
  await page.waitForTimeout(1500);
  await h.ready();
  await page.waitForTimeout(1500);
  const times = [];
  let n = 0;
  let stopped = false;
  const onFrame = async (fr) => {
    if (stopped) return;
    writeFileSync(join(dir, `f${String(n++).padStart(5, '0')}.jpg`), Buffer.from(fr.data, 'base64'));
    times.push(fr.metadata.timestamp);
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: fr.sessionId });
    } catch {
      /* closed */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 800 });
  try {
    const targets = await h.yd(() => window.__yadori.targets());
    const couch = targets.find((t) => t.label === 'couch');
    const lamp = targets.find((t) => t.label === 'lamp');
    // glide the cursor over the room, hover the couch (outline + chip), click
    const sc = await h.screenOf(couch.center);
    await page.mouse.move(sc.x - 260, sc.y - 120, { steps: 2 });
    await page.mouse.move(sc.x, sc.y, { steps: 25 });
    await page.waitForTimeout(900);
    await page.mouse.down();
    await page.mouse.up();
    await f.waitForFunction(() => window.__yadori.spirits().length === 1, null, { timeout: 15000 });
    await page.waitForTimeout(2600); // bloom + camera dolly
    let c = await h.face('couch');
    // the eyes follow the cursor
    const fc = await h.screenOf(c.facePos);
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      await page.mouse.move(fc.x + Math.cos(a) * 160, fc.y + Math.sin(a) * 90);
      await page.waitForTimeout(30);
    }
    c = await h.face('couch');
    await h.stroke(c.facePos, c.size, 'poke');
    await page.waitForTimeout(1300);
    await h.stroke(c.facePos, c.size, 'pet');
    await page.waitForTimeout(1600);
    await h.stroke(c.facePos, c.size, 'flick');
    await page.waitForTimeout(1500);
    const input = f.locator('#y-text');
    await input.click();
    await input.pressSequentially('Ow. Rude. I hold this whole room together, you know.', { delay: 25 });
    await f.locator('#y-send').click();
    await page.waitForTimeout(4200);
    const ls = await h.screenOf((await h.yd(() => window.__yadori.targets())).find((t) => t.label === 'lamp').center);
    await page.mouse.move(ls.x, ls.y, { steps: 20 });
    await page.waitForTimeout(500);
    await page.mouse.down();
    await page.mouse.up();
    await f.waitForFunction(() => window.__yadori.spirits().length === 2, null, { timeout: 15000 });
    await page.waitForTimeout(2200);
    await f.locator('[data-speaker]', { hasText: 'Couch' }).click();
    await f.locator('#y-to').selectOption({ label: 'Lamp' });
    await input.click();
    await input.pressSequentially('Lamp. They poked me.', { delay: 25 });
    await f.locator('#y-send').click();
    await page.waitForTimeout(3500);
    await input.click();
    await input.pressSequentially('Good. You needed it.', { delay: 25 });
    await f.locator('#y-send').click();
    await page.waitForTimeout(3800);
  } finally {
    stopped = true;
    await cdp.send('Page.stopScreencast').catch(() => null);
    cdp.off('Page.screencastFrame', onFrame);
    writeFileSync(join(dir, 'times.json'), JSON.stringify(times));
  }
  return { frames: times.length, seconds: times.length ? times[times.length - 1] - times[0] : 0 };
}
