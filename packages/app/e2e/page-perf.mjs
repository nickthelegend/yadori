import { args } from './page-args.mjs';
// Frame-time probe: {frames}. Returns p50/p95 CPU ms, draw calls, triangles.
export default async function run({ frame, workspaceRoot }) {
  const a = args(workspaceRoot);
  await frame.evaluate((n) => window.__perf.start(n), a.frames ?? 600);
  await frame.waitForFunction(() => { const p = window.__perf.progress(); return p.done >= p.target; }, null, { timeout: 90000, polling: 500 });
  return frame.evaluate(() => window.__perf.result());
}
