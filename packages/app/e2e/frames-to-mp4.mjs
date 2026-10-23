// Turn a screencast frame folder (JPEGs + times.json) into an H.264 MP4 at real timing,
// with a small caption box. Usage: node e2e/frames-to-mp4.mjs <frameDir> <out.mp4> "<caption>"
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out, caption = ''] = process.argv.slice(2);
const times = JSON.parse(readFileSync(join(dir, 'times.json'), 'utf8'));
const lines = [];
for (let i = 0; i < times.length; i++) {
  const d = i + 1 < times.length ? Math.max(0.001, times[i + 1] - times[i]) : 0.1;
  lines.push(`file '${join(dir, `f${String(i).padStart(5, '0')}.jpg`).replace(/'/g, "'\\''")}'`, `duration ${d.toFixed(4)}`);
}
lines.push(lines[lines.length - 2]); // concat demuxer needs the last file repeated
const list = join(dir, 'list.txt');
writeFileSync(list, lines.join('\n'));
const esc = caption.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019");
const vf = [
  'scale=1280:-2:flags=lanczos',
  'fps=30',
  ...(caption
    ? [`drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${esc}':x=16:y=h-th-18:fontsize=20:fontcolor=0xfff8ec:box=1:boxcolor=0x121212@0.82:boxborderw=10`]
    : []),
].join(',');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out], { stdio: 'inherit' });
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
console.log(`${out}  ${Number(dur).toFixed(1)} s, ${times.length} frames captured`);
