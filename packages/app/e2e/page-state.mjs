// Read-only snapshot of the app (for assertions).
export default async function run({ frame }) {
  return frame.evaluate(() => {
    const y = window.__yadori;
    return { mode: y.mode(), waking: y.waking(), particles: y.particles(), voiceMode: y.voiceMode(), targets: y.targets(), spirits: y.spirits() };
  });
}
