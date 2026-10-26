import { captureManaged } from './audit-network.mjs';
// Meta VR Glasses profile (IWER metaVRGlasses): gaze picks, a pinch selects; the woken face
// and its bubble must sit inside the glasses' view (37° left/right, 25° up, 43° down).
// Run with dev.emulator.device = "metaVRGlasses" (e2e/run-glasses.sh switches it).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, cli, consoleErrors, enterXR, page, sleep, state, until, xr } from './cli.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const t0 = Date.now();
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
  const st = xr('status');
  check('glasses profile active with gaze', st.deviceName === 'Meta VR Glasses' && JSON.stringify(st).includes('gaze-tracking'), st.deviceName);
  xr('set-input-mode', { mode: 'hand' });
  let s = await state();
  const couch = s.targets.find((t) => t.label === 'couch');
  const aim = { x: couch.center[0], y: couch.center[1] + 0.15, z: couch.center[2] };
  xr('look-at', { device: 'headset', target: aim });
  xr('look-at', { device: 'gaze', target: aim });
  await sleep(0.6);
  const hov = page('page-state.mjs');
  const h = await (async () => page('page-hover.mjs'))();
  check('gaze hovers the couch (outline + chip)', h.targets[3] === 'couch', JSON.stringify(h.targets));
  xr('select', { device: 'hand-right' });
  await until(async () => (await state()).spirits.length === 1, 'couch spirit', 15).catch(() => null);
  await sleep(1.6);
  s = await state();
  const c = s.spirits[0];
  check('gaze + pinch wakes the couch', c?.label === 'couch' && c.awake, c?.label ?? 'none');
  // field of view: face corners and the bubble region relative to the head
  const dev = xr('get-device-state');
  const head = dev.headset ?? dev.state?.headset;
  const hp = head.position;
  const q = head.orientation ?? head.quaternion;
  // rotate world offsets into head space (inverse quaternion)
  const inv = [-q.x, -q.y, -q.z, q.w];
  const rot = (v) => {
    const [x, y, z, w] = inv;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  };
  const half = c.size / 2;
  const pts = {
    'face top-left': [c.facePos[0] - half, c.facePos[1] + half, c.facePos[2]],
    'face bottom-right': [c.facePos[0] + half, c.facePos[1] - half, c.facePos[2]],
    'bubble top (est.)': [c.facePos[0], c.facePos[1] + half + 0.4, c.facePos[2]],
  };
  for (const [name, p] of Object.entries(pts)) {
    const d = rot([p[0] - hp.x, p[1] - hp.y, p[2] - hp.z]);
    const hAng = (Math.atan2(d[0], -d[2]) * 180) / Math.PI;
    const vAng = (Math.atan2(d[1], -d[2]) * 180) / Math.PI;
    check(`inside the glasses view: ${name}`, Math.abs(hAng) <= 37 && vAng <= 25 && vAng >= -43, `h ${hAng.toFixed(1)}°, v ${vAng.toFixed(1)}°`);
  }
  mkdirSync(join(APP, '../../e2e/shots'), { recursive: true });
  cli('browser', 'screenshot', '--output-file', join(APP, '../../e2e/shots/glasses-fov.png'));
  {
    const { auditGlassesBubble } = await import('./audit-glasses-bubble.mjs');
    const bubble = await auditGlassesBubble();
    check('actual speech bubble corners fit the glasses view', bubble.ok, JSON.stringify(bubble.angles));
  }
  // fallback: gaze disconnected -> the hand ray targets again
  xr('set-connected', { device: 'gaze', connected: false });
  const lamp = s.targets.find((t) => t.label === 'lamp');
  xr('look-at', { device: 'hand-right', target: { x: lamp.center[0], y: lamp.center[1] + 0.5, z: lamp.center[2] } });
  await sleep(0.4);
  xr('select', { device: 'hand-right' });
  await until(async () => (await state()).spirits.length === 2, 'lamp via hand ray', 15).catch(() => null);
  check('with gaze disconnected, the hand ray wakes the lamp', (await state()).spirits.length === 2);
  xr('set-connected', { device: 'gaze', connected: true });
  const errors = consoleErrors(t0);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  void hov;
  xr('exit');
}
let capture;
try {
  capture = await captureManaged('glasses');
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
mkdirSync(join(APP, 'e2e', 'results'), { recursive: true });
writeFileSync(join(APP, 'e2e', 'results', 'xr-glasses.json'), JSON.stringify({ profile: 'metaVRGlasses', pass: results.length - fail, fail, results, at: new Date().toISOString() }, null, 2));
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
