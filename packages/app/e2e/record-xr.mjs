// Records the emulator "whoa" clips (IWER, Quest 3 profile, synthetic room yadori_den,
// hands only) to grokbot/videos/yadori/. Test recordings, not the demo video.
// Run: node e2e/record-xr.mjs   (dev server up in agent mode)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP, enterXR, flickSteps, page, petSteps, pinchAt, pokeSteps, sleep, state, until, xr } from './cli.mjs';

const OUT = join(APP, '../../../../videos/yadori');
mkdirSync(OUT, { recursive: true });
const face = async (label) => (await state()).spirits.find((s) => s.label === label);
const mp4 = (name, file, caption) =>
  execFileSync(process.execPath, [join(APP, 'e2e/frames-to-mp4.mjs'), join(APP, 'e2e/.rec', name), join(OUT, file), caption], { stdio: 'inherit' });

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
xr('set-transform', { device: 'headset', position: { x: 0.15, y: 1.5, z: -0.7 } });
let s = await state();
const couch = s.targets.find((t) => t.label === 'couch');
const lamp = s.targets.find((t) => t.label === 'lamp');
xr('look-at', { device: 'headset', target: { x: -0.3, y: 0.8, z: -3.0 } });
await sleep(1);

// clip 1: pinch the couch awake, then poke / pet / flick it
page('rec-start.mjs', { name: 'xr-wake' });
await sleep(1.2);
xr('look-at', { device: 'hand-right', target: { x: couch.center[0] + 0.4, y: couch.center[1] + 0.1, z: couch.center[2] } });
await sleep(0.6);
xr('look-at', { device: 'hand-right', target: { x: couch.center[0], y: couch.center[1] + 0.1, z: couch.center[2] } });
await sleep(1.4);
await pinchAt([couch.center[0], couch.center[1] + 0.1, couch.center[2]]);
await until(async () => (await state()).spirits.length === 1, 'couch', 15);
await sleep(3);
let c = await face('couch');
xr('run-sequence', { device: 'hand-right', steps: pokeSteps(c) });
await sleep(1.2);
xr('run-sequence', { device: 'hand-right', steps: petSteps(c) });
await sleep(1.5);
xr('run-sequence', { device: 'hand-right', steps: flickSteps(c) });
await sleep(1.8);
page('rec-stop.mjs');
mp4('xr-wake', 'yadori-emu-wake-poke-pet-flick.mp4', 'IWER emulator, Quest 3 profile, synthetic room - hands only - built-in face (not generated)');

// clip 2: wake the lamp, gossip (puppet lines typed by the tester)
xr('set-transform', { device: 'headset', position: { x: 0.2, y: 1.5, z: -0.5 } });
xr('look-at', { device: 'headset', target: { x: -0.8, y: 0.9, z: -3.0 } });
xr('set-transform', { device: 'hand-right', position: { x: 0.35, y: 1.15, z: -0.75 } });
await sleep(0.8);
page('rec-start.mjs', { name: 'xr-gossip' });
await sleep(1);
xr('look-at', { device: 'hand-right', target: { x: lamp.center[0], y: lamp.center[1] + 0.5, z: lamp.center[2] } });
await sleep(1.2);
await pinchAt([lamp.center[0], lamp.center[1] + 0.5, lamp.center[2]]);
await until(async () => (await state()).spirits.length === 2, 'lamp', 15);
await sleep(2.5);
page('page-say.mjs', { speaker: 'Couch', to: 'Lamp', text: 'Lamp. They poked me. Twice.', delay: 30 });
await until(async () => !(await face('couch')).speaking, 'line', 20);
await sleep(0.8);
page('page-say.mjs', { speaker: 'Lamp', to: 'Couch', text: 'Good. You were getting smug.', delay: 30 });
await until(async () => !(await face('lamp')).speaking, 'reply', 20);
await sleep(0.8);
page('page-say.mjs', { speaker: 'Couch', to: 'Lamp', text: 'Says the one who stares at the ceiling all night.', delay: 30 });
await until(async () => !(await face('couch')).speaking, 'line', 20);
await sleep(1.5);
page('rec-stop.mjs');
mp4('xr-gossip', 'yadori-emu-two-spirits-gossip.mp4', 'IWER emulator, synthetic room - puppet mode: lines typed by the tester, no Muse Spark key yet');
xr('exit');
