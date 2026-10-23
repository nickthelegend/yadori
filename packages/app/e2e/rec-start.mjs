import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { args } from './page-args.mjs';
// Start a CDP screencast of the managed page into e2e/.rec/<name>/ (JPEG frames + times).
export default async function run({ cdp, workspaceRoot }) {
  const a = args(workspaceRoot);
  const dir = join(workspaceRoot, 'e2e', '.rec', a.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const times = [];
  globalThis.__yadoriRec = { dir, times, cdp, stopped: false };
  cdp.on('Page.screencastFrame', async (f) => {
    const rec = globalThis.__yadoriRec;
    if (!rec || rec.stopped) return;
    const file = join(dir, `f${String(n++).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    times.push(f.metadata.timestamp);
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
    } catch {
      /* session gone */
    }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: a.width ?? 1280, maxHeight: a.height ?? 800, everyNthFrame: 1 });
  return { dir };
}
