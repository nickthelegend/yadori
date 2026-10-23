// Tiny wrapper around the IWSDK CLI for the e2e orchestrators (plain node, not browser-run).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(APP, 'node_modules/@iwsdk/cli/dist/cli.js');

export function cli(...argv) {
  let out;
  try {
    out = execFileSync(process.execPath, [CLI, ...argv], { cwd: APP, encoding: 'utf8', timeout: 150000, maxBuffer: 64 << 20 });
  } catch (e) {
    out = e.stdout?.toString() ?? '';
    if (!out) throw e;
  }
  const j = JSON.parse(out);
  if (!j.ok) throw new Error(`${argv.slice(0, 2).join(' ')}: ${j.error?.message ?? out.slice(0, 300)}`);
  return j.data?.result ?? j.data;
}

export const xr = (action, input) => cli('xr', action, ...(input ? ['--input-json', JSON.stringify(input)] : []));
export function page(script, args = {}) {
  writeFileSync(join(APP, 'e2e', '.args.json'), JSON.stringify(args));
  return cli('browser', 'run', `e2e/${script}`, '--timeout', '105000');
}
export const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
export const state = () => page('page-state.mjs');

export async function until(fn, what, timeoutS = 20, everyS = 0.6) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutS * 1000) throw new Error(`timed out waiting for ${what}`);
    await sleep(everyS);
  }
}

export function consoleErrors(since = 0) {
  const logs = cli('browser', 'logs', '--input-json', JSON.stringify({ count: 200, level: ['error'], ...(since ? { since } : {}) }));
  const list = Array.isArray(logs) ? logs : logs?.logs ?? [];
  return list.filter((l) => l.level === 'error').map((l) => l.message);
}

// face-relative positions for hand sequences
export const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const rightOf = (dir) => {
  const r = [dir[2], 0, -dir[0]]; // up x dir with up = +y
  const l = Math.hypot(...r) || 1;
  return r.map((v) => v / l);
};
export const P = (v) => ({ x: +v[0].toFixed(4), y: +v[1].toFixed(4), z: +v[2].toFixed(4) });

export async function enterXR() {
  const st = xr('status');
  if (!st.sessionActive) xr('enter');
  await until(() => xr('status').sessionActive, 'XR session');
  await until(async () => (await state()).targets.some((t) => t.id.startsWith('mesh-')), 'detected meshes', 25);
}

/** Aim the right hand at a world point and pinch (select). */
export async function pinchAt(target) {
  xr('look-at', { device: 'hand-right', target: P(target) });
  await sleep(0.3);
  return xr('select', { device: 'hand-right', duration: 0.2 });
}

export function pokeSteps(f) {
  const out = add(f.facePos, f.faceDir, 0.14);
  const into = add(f.facePos, f.faceDir, -0.004);
  return [
    { label: 'approach', position: P(out), anchor: 'index-tip', poseId: 'point', orientation: { fingers: 'forward', palm: 'down' }, duration: 0.9 },
    { label: 'poke', position: P(into), anchor: 'index-tip', duration: 0.12 },
    { label: 'back', position: P(out), anchor: 'index-tip', duration: 0.35 },
  ];
}

export function petSteps(f) {
  const r = rightOf(f.faceDir);
  const c = add(add(f.facePos, f.faceDir, 0.05), [0, 1, 0], 0.01);
  const a = add(c, r, -0.08);
  const b = add(c, r, 0.08);
  const far = add(f.facePos, f.faceDir, 0.2);
  return [
    { label: 'raise', position: P(far), anchor: 'grip', poseId: 'flat', orientation: { fingers: 'up', palm: 'forward' }, duration: 1.0 },
    { label: 'settle', position: P(a), anchor: 'grip', duration: 0.6 },
    { label: 'stroke', position: P(b), anchor: 'grip', duration: 0.45 },
    { label: 'stroke', position: P(a), anchor: 'grip', duration: 0.45 },
    { label: 'stroke', position: P(b), anchor: 'grip', duration: 0.45 },
    { label: 'leave', position: P(far), anchor: 'grip', duration: 0.5 },
  ];
}

export function flickSteps(f) {
  const r = rightOf(f.faceDir);
  const c = add(f.facePos, f.faceDir, 0.03);
  const far = add(f.facePos, f.faceDir, 0.22);
  return [
    { label: 'wind up', position: P(add(add(c, r, -0.22), f.faceDir, 0.15)), anchor: 'index-tip', poseId: 'point', orientation: { fingers: 'forward', palm: 'down' }, duration: 0.9 },
    { label: 'in', position: P(add(c, r, -0.2)), anchor: 'index-tip', duration: 0.4 },
    { label: 'flick', position: P(add(c, r, 0.22)), anchor: 'index-tip', duration: 0.12 },
    { label: 'away', position: P(add(far, r, 0.25)), anchor: 'index-tip', duration: 0.3 },
  ];
}
