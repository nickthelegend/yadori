import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Stop the screencast and write the frame timestamps next to the frames.
export default async function run({ cdp }) {
  const rec = globalThis.__yadoriRec;
  if (!rec) return { error: 'no recording' };
  rec.stopped = true;
  try {
    await (rec.cdp ?? cdp).send('Page.stopScreencast');
  } catch {
    /* already stopped */
  }
  writeFileSync(join(rec.dir, 'times.json'), JSON.stringify(rec.times));
  globalThis.__yadoriRec = null;
  return { dir: rec.dir, frames: rec.times.length };
}
