import { captureManaged } from './audit-network.mjs';
// Emulated Quest 3 (IWER, synthetic room yadori_den), hands only, from a cold load:
// pinch to wake, poke / pet / flick with the fingertip and palm, a puppet line, a second
// spirit, gossip, a reply, frame time, console errors, reload + re-match, and the bare
// room's "Tell me what this is" path. Run: node e2e/xr-flow.mjs  (dev server must be up)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, cli, consoleErrors, enterXR, flickSteps, page, petSteps, pinchAt, pokeSteps, sleep, state, until, xr } from './cli.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const face = async (label) => (await state()).spirits.find((s) => s.label === label);
const actions = { pinch: 0, poke: 0, pet: 0, flick: 0 };
const t0 = Date.now();
let performanceResult = null;

async function main() {
  page('page-reset.mjs', { room: 'den' });
  await sleep(6);
  await until(async () => {
    try {
      return (await state()).targets.length > 0;
    } catch {
      return false;
    }
  }, 'app ready', 30);
  await enterXR();
  xr('set-input-mode', { mode: 'hand' });
  let s = await state();
  check('emulated room is labelled honestly', s.mode.label === 'Emulated room (IWER), not your room', s.mode.label);
  const labels = s.targets.map((t) => t.label).sort().join(',');
  check('mesh detection reports the 5 labelled pieces', labels === 'couch,lamp,plant,screen,table', labels);
  const couch = s.targets.find((t) => t.label === 'couch');

  // wake the couch with a pinch
  const tWake = Date.now();
  await pinchAt([couch.center[0], couch.center[1] + 0.1, couch.center[2]]);
  actions.pinch++;
  await until(async () => (await state()).spirits.length === 1, 'couch spirit', 15);
  await sleep(1.6);
  let c = await face('couch');
  check('couch woke from a pinch', c?.awake && c.params.reveal > 0.99, `${Date.now() - tWake} ms wall clock incl. CLI round trips`);
  const found = cli('ecs', 'find', '--input-json', JSON.stringify({ withComponents: ['Spirit'] }));
  const ents = found.entities ?? found;
  const idx = (Array.isArray(ents) ? ents : [])[0]?.entityIndex;
  const q = idx !== undefined ? cli('ecs', 'query', '--input-json', JSON.stringify({ entityIndex: idx })) : null;
  const spiritComp = JSON.stringify(q ?? {});
  check('ECS: a Spirit component with an anchored face', /"Spirit"/.test(spiritComp) && /anchor/.test(spiritComp), `entity ${idx}`);
  const err = Math.hypot(c.anchor[0] - couch.center[0], c.anchor[2] - (couch.center[2] + couch.dims[2] / 2 + 0.01));
  check('face sits on the couch front, 1 cm proud (±1 cm)', err <= 0.01, `${(err * 100).toFixed(2)} cm`);

  // poke
  xr('run-sequence', { device: 'hand-right', steps: pokeSteps(c) });
  actions.poke++;
  c = await face('couch');
  check('fingertip poke -> surprised', c.pokes >= 1, `pokes ${c.pokes} pets ${c.pets} flicks ${c.flicks} expr ${c.expression}`);
  await sleep(1.2);
  // pet
  const pets0 = c.pets;
  xr('run-sequence', { device: 'hand-right', steps: petSteps(c) });
  actions.pet++;
  c = await face('couch');
  check('palm stroke -> pet (happy, hearts)', c.pets > pets0, `pets ${c.pets} expr ${c.expression}`);
  await sleep(1.5);
  // flick
  const fl0 = c.flicks;
  xr('run-sequence', { device: 'hand-right', steps: flickSteps(c) });
  actions.flick++;
  c = await face('couch');
  check('fast fingertip swipe -> flick (wobble)', c.flicks > fl0, `flicks ${c.flicks} expr ${c.expression}`);
  await sleep(1.5);

  // a puppet line typed in the emulator's page while in XR
  page('page-say.mjs', { speaker: 'Couch', text: 'Oh. Hello. You have very cold fingers.' });
  let maxOpen = 0;
  let speaking = false;
  for (let i = 0; i < 12; i++) {
    const f = await face('couch');
    speaking ||= f.speaking;
    maxOpen = Math.max(maxOpen, f.params.mouthOpen);
    await sleep(0.25);
  }
  check('puppet line: speaking + mouth moves', speaking && maxOpen > 0.3, `max mouthOpen ${maxOpen.toFixed(2)}`);
  await until(async () => !(await face('couch')).speaking, 'line end', 20);
  c = await face('couch');
  check('voice mode is labelled', ['mms', 'browser', 'silent'].includes(c.voiceMode), c.voiceMode);

  // wake the lamp
  s = await state();
  const lamp = s.targets.find((t) => t.label === 'lamp');
  await pinchAt([lamp.center[0], lamp.center[1] + 0.5, lamp.center[2]]);
  actions.pinch++;
  await until(async () => (await state()).spirits.length === 2, 'lamp spirit', 15);
  await sleep(1.5);
  check('lamp woke from a pinch', (await face('lamp'))?.awake);

  // gossip
  page('page-say.mjs', { speaker: 'Couch', to: 'Lamp', text: 'Lamp. They poked me. Again.' });
  await sleep(1.0);
  s = await state();
  const cs = s.spirits.find((x) => x.label === 'couch');
  const ls = s.spirits.find((x) => x.label === 'lamp');
  check('gossip: whispers fly between them', s.particles > 5, `${s.particles} particles`);
  // eyes: dot product of each face's gaze with the direction to the other, via lookX sign in face space
  const dirTo = (a, b) => [b.facePos[0] - a.facePos[0], b.facePos[2] - a.facePos[2]];
  const sideOf = (a, b) => {
    const r = [a.faceDir[2], -a.faceDir[0]];
    const d = dirTo(a, b);
    return Math.sign(r[0] * d[0] + r[1] * d[1]);
  };
  // expected eye offset, computed the way a viewer would: the other face's direction in this face's frame
  const expectLook = (a, b) => {
    const d = [b.facePos[0] - a.facePos[0], b.facePos[1] - a.facePos[1], b.facePos[2] - a.facePos[2]];
    const dir = a.faceDir;
    const right = [dir[2], 0, -dir[0]];
    const z = Math.max(0.05, d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]);
    let x = Math.atan2(d[0] * right[0] + d[2] * right[2], z) / 0.75;
    let y = Math.atan2(d[1], z) / 0.6;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return [x, y];
  };
  const ec = expectLook(cs, ls);
  const el = expectLook(ls, cs);
  check('gossip: the couch looks at the lamp', Math.hypot(cs.params.lookX - ec[0], cs.params.lookY - ec[1]) < 0.2, `look ${cs.params.lookX.toFixed(2)},${cs.params.lookY.toFixed(2)} expected ${ec.map((v) => v.toFixed(2))}`);
  check('gossip: the lamp looks back at the couch', Math.hypot(ls.params.lookX - el[0], ls.params.lookY - el[1]) < 0.2, `look ${ls.params.lookX.toFixed(2)},${ls.params.lookY.toFixed(2)} expected ${el.map((v) => v.toFixed(2))}`);
  await until(async () => !(await face('couch')).speaking, 'gossip end', 20);
  await sleep(0.6);
  page('page-say.mjs', { speaker: 'Lamp', text: 'Then stop glowing at them.' });
  await until(async () => (await face('lamp')).lines >= 1, 'lamp reply', 20);
  check('the lamp replies', true);

  // frame time with two spirits, one talking
  page('page-say.mjs', { speaker: 'Couch', to: 'Lamp', text: 'I am not glowing. You are the one who glows. That is literally your whole job, and you know it.' });
  const perf = page('page-perf.mjs', { frames: 600 });
  performanceResult = perf;
  check('emulator frame time recorded (600 XR frames)', perf.frames === 600 && perf.xrFrames === 600, `p50 ${perf.cpuMs.p50.toFixed(2)} p95 ${perf.cpuMs.p95.toFixed(2)} ms, draw calls p95 ${perf.drawCalls.p95}, tris max ${perf.triangles.max}`);
  check('draw calls within budget (≤ 100)', perf.drawCalls.max <= 100, `max ${perf.drawCalls.max}`);

  // reload: re-match by label + size + position after the session restarts
  await until(async () => !(await face('couch')).speaking, 'line end', 25);
  cli('browser', 'reload');
  await sleep(5);
  await until(async () => {
    try {
      return (await state()).targets.length > 0;
    } catch {
      return false;
    }
  }, 'app ready', 30);
  await enterXR();
  await until(async () => (await state()).spirits.length === 2, 're-matched spirits', 15).catch(() => null);
  s = await state();
  check('after reload both spirits are re-found in the emulated room', s.spirits.length === 2, s.spirits.map((x) => `${x.name}:${x.lines} lines`).join(', '));

  const errors = consoleErrors(t0);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  // the bare room: one unlabelled box -> "Tell me what this is"
  xr('exit');
  page('page-reset.mjs', { room: 'bare' });
  await sleep(6);
  await until(async () => {
    try {
      return (await state()).targets.length > 0;
    } catch {
      return false;
    }
  }, 'bare app ready', 30);
  await enterXR();
  xr('set-input-mode', { mode: 'hand' });
  s = await state();
  const thing = s.targets.find((t) => t.label === 'other');
  check('bare room reports one unlabelled mesh', s.targets.length === 1 && !!thing, s.targets.map((t) => t.label).join(','));
  await pinchAt(thing.center);
  page('page-dialog.mjs', { answer: 'coat rack' });
  await until(async () => (await state()).spirits.length === 1, 'named spirit', 15).catch(() => null);
  s = await state();
  check('"Tell me what this is" -> it wakes with the name you gave', s.spirits[0]?.label === 'coat rack', s.spirits[0]?.label ?? 'none');
  xr('exit');
  page('page-reset.mjs', { room: 'den' });
}

let capture;
try {
  capture = await captureManaged('quest');
  await main();
} catch (e) {
  check('flow completed', false, e instanceof Error ? e.message : String(e));
} finally {
  if (capture) {
    const network = await capture.stop();
    check('independent console, page and network capture is clean', network.responses > 0 && network.errors.length === 0, `${network.responses} responses; ${network.errors.length} errors`);
  }
}
const fail = results.filter((r) => !r.ok).length;
const summary = { profile: 'metaQuest3', input: 'hands only', actions, seconds: Math.round((Date.now() - t0) / 1000), pass: results.length - fail, fail, results, perf: performanceResult, at: new Date().toISOString() };
mkdirSync(join(APP, 'e2e', 'results'), { recursive: true });
writeFileSync(join(APP, 'e2e', 'results', 'xr-quest3.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
