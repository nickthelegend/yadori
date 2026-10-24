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
xr('set-transform', { device: 'headset', position: { x: 0.1, y: 1.45, z: -1.0 } });
let s = await state();
const couch = s.targets.find((t) => t.label === 'couch');
const lamp = s.targets.find((t) => t.label === 'lamp');
xr('look-at', { device: 'headset', target: { x: -0.15, y: 0.75, z: -3.0 } });
await sleep(1);

const only = process.env.CLIP ?? 'all';
// clip 1: pinch the couch awake, then poke / pet / flick it, then a puppet line
if (only === 'gossip') {
  await pinchAt([couch.center[0], couch.center[1] + 0.1, couch.center[2]]);
  await until(async () => (await state()).spirits.length === 1, 'couch', 15);
} else {
console.log(page('rec-xr-scene.mjs', { scene: 'wake', name: 'xr-wake' }));
mp4('xr-wake', 'yadori-emu-wake-poke-pet-flick.mp4', 'IWER emulator, Quest 3 profile, synthetic room - hands only - built-in face (not generated) - line typed by the tester');
}

// clip 2: wake the lamp, gossip (puppet lines typed by the tester)
xr('set-transform', { device: 'headset', position: { x: -0.7, y: 1.4, z: -1.45 } });
xr('look-at', { device: 'headset', target: { x: -0.8, y: 0.98, z: -2.85 } });
xr('set-transform', { device: 'hand-right', position: { x: -0.45, y: 1.1, z: -1.75 } });
await sleep(0.8);
console.log(page('rec-xr-scene.mjs', { scene: 'gossip', name: 'xr-gossip' }));
mp4('xr-gossip', 'yadori-emu-two-spirits-gossip.mp4', 'IWER emulator, synthetic room - puppet mode: lines typed by the tester (no Muse Spark key yet)');
xr('exit');
