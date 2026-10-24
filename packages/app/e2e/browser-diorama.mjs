// Browser mode (no headset): wake two pieces of furniture, poke/pet/flick, puppet lines,
// gossip, reload and re-match. Prints a PASS/FAIL list.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { helpers } from './lib.mjs';

export default async function run(ctx) {
  const h = helpers(ctx);
  try {
    return await body(ctx, h);
  } catch (e) {
    return { error: String(e).slice(0, 300), results: h.results, spirits: await h.spirits().catch(() => null) };
  }
}

async function body(ctx, h) {
  const { page } = ctx;
  const { f, check } = h;
  await f.evaluate(() => localStorage.removeItem('yadori.spirits.v1'));
  await f.evaluate(() => location.reload());
  await page.waitForTimeout(500);
  await h.ready();
  const targets = await h.yd(() => window.__yadori.targets());
  check('diorama has 5 labelled targets', targets.length === 5, targets.map((t) => t.label).join(','));
  check('mode label is honest', (await h.yd(() => window.__yadori.mode().label)) === 'Browser diorama, not your room');
  const couch = targets.find((t) => t.label === 'couch');
  const lamp = targets.find((t) => t.label === 'lamp');
  const t0 = Date.now();
  await h.clickWorld(couch.center);
  check('waking starts on click', (await h.yd(() => window.__yadori.waking())) === 'den-couch');
  await f.waitForFunction(() => window.__yadori.spirits().length === 1, null, { timeout: 15000 });
  const wakeMs = Date.now() - t0;
  await page.waitForTimeout(1800);
  let c = await h.face('couch');
  check('couch is awake with the built-in face', c && c.awake && c.params.reveal > 0.99, `wake ${wakeMs} ms`);
  const err = Math.hypot(c.anchor[0] - (couch.center[0]), c.anchor[2] - (couch.center[2] + 0.45 + 0.01));
  check('face anchored on the couch front, 1 cm proud', err < 0.011, `err ${(err * 100).toFixed(2)} cm`);
  // reactions
  await page.waitForTimeout(2500); // let the camera settle on the couch
  c = await h.face('couch');
  await h.stroke(c.facePos, c.size, 'poke');
  await page.waitForTimeout(200);
  c = await h.face('couch');
  check('poke -> surprised', c.pokes === 1 && c.expression === 'surprised', `pokes ${c.pokes} expr ${c.expression}`);
  await page.waitForTimeout(1200);
  await h.stroke(c.facePos, c.size, 'pet');
  await page.waitForTimeout(200);
  c = await h.face('couch');
  check('pet -> happy', c.pets === 1 && c.expression === 'happy', `pets ${c.pets} expr ${c.expression}`);
  await page.waitForTimeout(2000);
  await h.stroke(c.facePos, c.size, 'flick');
  await page.waitForTimeout(150);
  c = await h.face('couch');
  check('flick -> grumpy + wobble', c.flicks === 1 && c.expression === 'grumpy', `flicks ${c.flicks} expr ${c.expression} wobble ${c.params.wobble.toFixed(2)}`);
  await page.waitForTimeout(1500);
  // puppet line
  await h.type('Hello. I have been holding this room together for years.');
  await f.waitForFunction(() => window.__yadori.spirits()[0].speaking, null, { timeout: 5000 });
  let maxOpen = 0;
  for (let i = 0; i < 20; i++) {
    const s = await h.face('couch');
    maxOpen = Math.max(maxOpen, s.params.mouthOpen);
    await page.waitForTimeout(100);
  }
  check('puppet line moves the mouth', maxOpen > 0.3, `max mouthOpen ${maxOpen.toFixed(2)}`);
  await f.waitForFunction(() => !window.__yadori.spirits()[0].speaking, null, { timeout: 20000 });
  c = await h.face('couch');
  check('line counted with a labelled voice mode', c.lines === 1 && ['browser', 'silent', 'mms'].includes(c.voiceMode), `voice ${c.voiceMode}`);
  // wake the lamp, gossip
  const lampNow = (await h.yd(() => window.__yadori.targets())).find((t) => t.label === 'lamp');
  await h.clickWorld(lampNow.center);
  await f.waitForFunction(() => window.__yadori.spirits().length === 2, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const lampS = await h.face('lamp');
  check('lamp is awake', lampS && lampS.awake);
  // the couch says something to the lamp
  await f.locator('[data-speaker]', { hasText: 'Couch' }).click();
  await f.locator('#y-to').selectOption({ label: 'Lamp' });
  await h.type('Lamp, they keep putting their feet on me.');
  await f.waitForFunction(() => window.__yadori.spirits().find((s) => s.label === 'couch').speaking, null, { timeout: 5000 });
  await page.waitForTimeout(400);
  const during = await h.spirits();
  const cs = during.find((s) => s.label === 'couch');
  const ls = during.find((s) => s.label === 'lamp');
  // the lamp is to the couch's left as you face it: the couch looks toward -x of the room, the lamp looks back
  check('gossip: whisper particles fly', (await h.yd(() => window.__yadori.particles())) > 5);
  check('gossip: the lamp turns its eyes to the couch', ls.params.lookX > 0.2, `lamp lookX ${ls.params.lookX.toFixed(2)}`);
  check('gossip: the couch looks at the lamp', cs.params.lookX < -0.2, `couch lookX ${cs.params.lookX.toFixed(2)}`);
  await f.waitForFunction(() => !window.__yadori.spirits().find((s) => s.label === 'couch').speaking, null, { timeout: 20000 });
  await f.waitForFunction(() => /Reply as/.test(document.querySelector('#y-text')?.getAttribute('placeholder') ?? ''), null, { timeout: 3000 }).catch(() => null);
  const placeholder = await f.locator('#y-text').getAttribute('placeholder');
  check('compose switches to "reply as Lamp"', /Reply as Lamp/.test(placeholder ?? ''), placeholder);
  await h.type('Then stop being so comfortable.');
  await f.waitForFunction(() => window.__yadori.spirits().find((s) => s.label === 'lamp').lines === 1, null, { timeout: 20000 });
  check('lamp replied', true);
  // reload: both come back by label/size/position
  await f.evaluate(() => location.reload());
  await page.waitForTimeout(800);
  await h.ready();
  await f.waitForFunction(() => window.__yadori.spirits().length === 2, null, { timeout: 15000 }).catch(() => null);
  const back = await h.spirits();
  check('reload re-matches both spirits', back.length === 2 && back.every((s) => s.awake), back.map((s) => `${s.name}:${s.lines}`).join(','));
  const failed = h.results.filter((r) => !r.ok);
  const perf = await f.evaluate(async () => {
    window.__perf.start(600);
    while (window.__perf.progress().done < 600) await new Promise((r) => setTimeout(r, 250));
    return window.__perf.result();
  });
  const out = { mode: 'browser diorama (no headset), real mouse + keyboard', pass: h.results.length - failed.length, fail: failed.length, results: h.results, perf, at: new Date().toISOString() };
  mkdirSync(join(ctx.workspaceRoot, 'e2e', 'results'), { recursive: true });
  writeFileSync(join(ctx.workspaceRoot, 'e2e', 'results', 'browser-diorama.json'), JSON.stringify(out, null, 2));
  return out;
}
