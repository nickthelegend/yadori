// Turn a screencast frame folder (JPEGs + times.json) into an H.264 MP4 at real timing,
// with a small caption box. Usage: node e2e/frames-to-mp4.mjs <frameDir> <out.mp4> "<caption>"
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [dirArg, out, caption = ''] = process.argv.slice(2);
const dir = resolve(dirArg);
const times = JSON.parse(readFileSync(join(dir, 'times.json'), 'utf8'));
const lines = [];
for (let i = 0; i < times.length; i++) {
  const d = i + 1 < times.length ? Math.max(0.001, times[i + 1] - times[i]) : 0.1;
  lines.push(`file '${join(dir, `f${String(i).padStart(5, '0')}.jpg`).replace(/'/g, "'\\''")}'`, `duration ${d.toFixed(4)}`);
}
lines.push(lines[lines.length - 2]); // concat demuxer needs the last file repeated
const list = join(dir, 'list.txt');
writeFileSync(list, lines.join('\n'));
// caption: drawn into a PNG with Pillow (this ffmpeg has no drawtext), then overlaid
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
let filter = 'scale=1280:-2:flags=lanczos,fps=30';
if (caption) {
  const png = join(dir, 'caption.png');
  const py = `
from PIL import Image, ImageDraw, ImageFont
import sys
text, out = sys.argv[1], sys.argv[2]
f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
w = int(f.getlength(text)) + 24
im = Image.new('RGBA', (w, 36), (18, 18, 18, 210))
ImageDraw.Draw(im).text((12, 7), text, font=f, fill=(255, 248, 236, 255))
im.save(out)
`;
  execFileSync('python3', ['-c', py, caption, png]);
  args.push('-i', png);
  filter = `[0:v]${filter}[v];[v][1:v]overlay=16:main_h-overlay_h-16`;
}
args.push('-filter_complex', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
console.log(`${out}  ${Number(dur).toFixed(1)} s, ${times.length} frames captured`);
