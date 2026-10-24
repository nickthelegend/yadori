import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flickSteps, petSteps, pokeSteps, xr } from './cli.mjs';
import { args } from './page-args.mjs';
// One recorded emulator scene, run inside a single browser lease: a CDP screencast of the
// whole page, emulated hands driven through the IWSDK CLI (xr commands do not need the
// lease), and puppet lines typed into the page. {scene: 'wake' | 'gossip', name}
export default async function run({ frame, cdp, page, workspaceRoot }) {
  const a = args(workspaceRoot);
  const dir = join(workspaceRoot, 'e2e', '.rec', a.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const times = [];
  let n = 0;
  let stopped = false;
  const onFrame = async (f) => {
    if (stopped) return;
    writeFileSync(join(dir, `f${String(n++).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    times.push(f.metadata.timestamp);
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
    } catch {
      /* closed */
    }
  };
  const wait = (ms) => page.waitForTimeout(ms);
  const st = () => frame.evaluate(() => ({ targets: window.__yadori.targets(), spirits: window.__yadori.spirits() }));
  const until = async (fn, ms = 15000) => {
    const t0 = Date.now();
    while (!(await fn())) {
      if (Date.now() - t0 > ms) throw new Error('timeout');
      await wait(200);
    }
  };
  const P = (v) => ({ x: v[0], y: v[1], z: v[2] });
  const say = async (speaker, text, to) => {
    await frame.locator('[data-speaker]', { hasText: speaker }).click();
    if (to) await frame.locator('#y-to').selectOption({ label: to });
    const input = frame.locator('#y-text');
    await input.click();
    await input.pressSequentially(text, { delay: 30 });
    await frame.locator('#y-send').click();
    await wait(400);
    await until(async () => !(await st()).spirits.some((s) => s.speaking), 25000);
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 800 });
  try {
    let s = await st();
    if (a.scene === 'wake') {
      const couch = s.targets.find((t) => t.label === 'couch');
      await wait(1000);
      xr('look-at', { device: 'hand-right', target: P([couch.center[0] + 0.5, couch.center[1] + 0.1, couch.center[2]]) });
      await wait(500);
      xr('look-at', { device: 'hand-right', target: P([couch.center[0], couch.center[1] + 0.1, couch.center[2]]) });
      await wait(1400);
      xr('select', { device: 'hand-right', duration: 0.2 });
      await until(async () => (await st()).spirits.length === 1);
      await wait(2600);
      let c = (await st()).spirits[0];
      // lean in, as a person would, so the hand can reach the face
      const near = [c.facePos[0] + c.faceDir[0] * 0.48, c.facePos[1] + 0.36, c.facePos[2] + c.faceDir[2] * 0.48];
      xr('animate-to', { device: 'headset', position: P(near), duration: 1.4, easing: 'minimum-jerk' });
      await wait(1500);
      xr('look-at', { device: 'headset', target: P([c.facePos[0], c.facePos[1] + 0.05, c.facePos[2]]) });
      await wait(900);
      c = (await st()).spirits[0];
      xr('run-sequence', { device: 'hand-right', body: 'fixed', gaze: 'fixed', steps: pokeSteps(c) });
      await wait(1200);
      c = (await st()).spirits[0];
      xr('run-sequence', { device: 'hand-right', body: 'fixed', gaze: 'fixed', steps: petSteps(c) });
      await wait(1400);
      c = (await st()).spirits[0];
      xr('run-sequence', { device: 'hand-right', body: 'fixed', gaze: 'fixed', steps: flickSteps(c) });
      await wait(1800);
      await say('Couch', 'Ow. Cold fingers. Very rude.');
      await wait(1200);
    } else {
      const lamp = s.targets.find((t) => t.label === 'lamp');
      await wait(800);
      xr('look-at', { device: 'hand-right', target: P([lamp.center[0], lamp.center[1] + 0.5, lamp.center[2]]) });
      await wait(1200);
      xr('select', { device: 'hand-right', duration: 0.2 });
      await until(async () => (await st()).spirits.length === 2);
      await wait(2600);
      await say('Couch', 'Lamp. They poked me. Twice.', 'Lamp');
      await wait(500);
      await say('Lamp', 'Good. You were getting smug.', 'Couch');
      await wait(500);
      await say('Couch', 'Says the one who stares at the ceiling all night.', 'Lamp');
      await wait(1500);
    }
  } finally {
    stopped = true;
    await cdp.send('Page.stopScreencast').catch(() => null);
    cdp.off('Page.screencastFrame', onFrame);
    writeFileSync(join(dir, 'times.json'), JSON.stringify(times));
  }
  return { frames: times.length, seconds: times.length ? times[times.length - 1] - times[0] : 0 };
}
