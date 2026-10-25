// Switch the existing managed runtime, run the hands + gaze suite, and restore Quest.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, cli, sleep, until, xr } from './cli.mjs';

const configPath = join(APP, 'iwsdk.config.json');
const original = readFileSync(configPath);
const config = JSON.parse(original);
const initialDevice = config.dev?.emulator?.device;
const questConfig = structuredClone(config);
if (questConfig.dev?.emulator) questConfig.dev.emulator.device = 'metaQuest3';
const restoredConfig = initialDevice === 'metaQuest3' ? original : `${JSON.stringify(questConfig, null, 2)}\n`;
const resultPath = join(APP, 'e2e/results/xr-glasses.json');
const startedAt = new Date().toISOString();
let changed = initialDevice === 'metaVRGlasses';
let child;

function restore() {
  if (changed) {
    writeFileSync(configPath, restoredConfig);
    changed = false;
  }
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => {
    child?.kill(signal);
    restore();
    process.exit(code);
  });
}

async function ready(deviceName) {
  // Let the config watcher start its restart before checking the command bridge.
  await sleep(1);
  await until(() => {
    try {
      return cli('dev', 'status').state?.browserCommandReady === true
        && xr('status').deviceName === deviceName;
    } catch {
      return false; // The bridge is temporarily unavailable during a restart.
    }
  }, `${deviceName} browser command bridge`, 60);
}

try {
  if (!['metaQuest3', 'metaVRGlasses'].includes(initialDevice)) {
    throw new Error('The glasses runner supports metaQuest3 or metaVRGlasses and restores metaQuest3 afterwards.');
  }
  if (!cli('dev', 'status').state?.browserCommandReady) {
    throw new Error('The managed server must be running with browserCommandReady: true before the glasses suite.');
  }
  config.dev.emulator.device = 'metaVRGlasses';
  changed = true;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  try {
    await ready('Meta VR Glasses');
    child = spawn(process.execPath, ['e2e/glasses-flow.mjs'], { cwd: APP, stdio: 'inherit' });
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    restore();
    await ready('Meta Quest 3');
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  let summary;
  try {
    summary = JSON.parse(readFileSync(resultPath, 'utf8'));
    if (!summary.at || summary.at < startedAt) summary = null;
  } catch { /* There may be no result if the profile never became ready. */ }
  summary ??= { profile: 'metaVRGlasses', pass: 0, fail: 0, results: [], at: new Date().toISOString() };
  summary.results.push({ name: 'glasses profile runner completed', ok: false, detail });
  summary.fail++;
  mkdirSync(join(APP, 'e2e/results'), { recursive: true });
  writeFileSync(resultPath, JSON.stringify(summary, null, 2));
  console.error(`FAIL  glasses profile runner completed  (${detail})`);
  console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
  process.exitCode = 1;
} finally {
  restore();
}
