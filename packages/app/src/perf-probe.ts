/**
 * Frame-time probe for the emulator benchmark. Wraps world.update + renderer.render and
 * records CPU ms per frame (ECS update to render submit; GPU time is not measured) and
 * renderer.info draw calls / triangles. Driven by e2e scripts via window.__perf.
 * Emulator numbers are a relative proxy, not Quest numbers.
 */
import type { World } from '@iwsdk/core';

export interface PerfResult {
  frames: number;
  cpuMs: { p50: number; p95: number; max: number; mean: number };
  drawCalls: { p50: number; p95: number; max: number };
  triangles: { p50: number; max: number };
  xrFrames: number;
  gl: string;
}

const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : NaN;

export function installPerfProbe(world: World): void {
  const renderer = world.renderer;
  let target = 0;
  let t0 = 0;
  let inFrame = false;
  const cpu: number[] = [];
  const calls: number[] = [];
  const tris: number[] = [];
  let xrFrames = 0;
  let gl = 'unknown';
  try {
    const ctx = renderer.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    gl = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(ctx.getParameter(ctx.RENDERER));
  } catch {
    /* keep unknown */
  }
  // count every render pass of a frame (XR renders both eyes in one call with multiview off)
  renderer.info.autoReset = false;
  const origUpdate = world.update.bind(world);
  world.update = ((delta: number, time: number) => {
    renderer.info.reset();
    if (cpu.length < target) {
      t0 = performance.now();
      inFrame = true;
    }
    origUpdate(delta, time);
  }) as typeof world.update;
  const origRender = renderer.render.bind(renderer);
  renderer.render = ((scene, camera) => {
    origRender(scene, camera);
    if (inFrame) {
      inFrame = false;
      cpu.push(performance.now() - t0);
      calls.push(renderer.info.render.calls);
      tris.push(renderer.info.render.triangles);
      if (renderer.xr.isPresenting) xrFrames++;
    }
  }) as typeof renderer.render;

  (window as unknown as { __perf: unknown }).__perf = {
    start(frames: number) {
      cpu.length = 0;
      calls.length = 0;
      tris.length = 0;
      xrFrames = 0;
      target = frames;
      return true;
    },
    progress: () => ({ done: cpu.length, target }),
    result(): PerfResult {
      const c = [...cpu].sort((a, b) => a - b);
      const d = [...calls].sort((a, b) => a - b);
      const t = [...tris].sort((a, b) => a - b);
      return {
        frames: c.length,
        cpuMs: { p50: pct(c, 50), p95: pct(c, 95), max: c[c.length - 1] ?? NaN, mean: c.reduce((a, b) => a + b, 0) / Math.max(1, c.length) },
        drawCalls: { p50: pct(d, 50), p95: pct(d, 95), max: d[d.length - 1] ?? NaN },
        triangles: { p50: pct(t, 50), max: t[t.length - 1] ?? NaN },
        xrFrames,
        gl,
      };
    },
  };
}
