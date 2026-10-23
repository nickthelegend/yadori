/**
 * Gateway configuration. MODEL_API_KEY is read from the environment (or the repo's
 * gitignored .env) and is never logged, echoed in a response, or sent to the browser.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = process.env.YADORI_ENV_FILE ?? resolve(ROOT, '.env');
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      // a malformed .env must not crash the gateway or print its contents
      console.error('[yadori] could not parse the .env file (contents not shown)');
    }
  }
}

export interface Config {
  key: string | null;
  base: string;
  models: { spark: string; wonder: string; image: string; transcribe: string; sam: string; tts: string };
  port: number;
  dataDir: string;
  modelsDir: string;
  runsDir: string;
  dailyCapUsd: number;
}

export function config(): Config {
  loadEnv();
  const e = process.env;
  return {
    key: e.MODEL_API_KEY && e.MODEL_API_KEY.trim() ? e.MODEL_API_KEY.trim() : null,
    base: (e.MODEL_API_BASE_URL ?? 'https://api.meta.ai/v1').replace(/\/+$/, ''),
    models: {
      spark: e.YADORI_SPARK_MODEL ?? 'muse-spark-1.3',
      wonder: e.YADORI_WONDER_MODEL ?? 'muse-wonder-1.0',
      image: e.YADORI_IMAGE_MODEL ?? 'muse-image-1.0',
      transcribe: e.YADORI_TRANSCRIBE_MODEL ?? 'muse-voice-transcribe-1.0',
      sam: e.YADORI_SAM_MODEL ?? 'sam-3.1',
      tts: 'facebook/mms-tts-eng',
    },
    port: Number(e.YADORI_PORT ?? 8440),
    dataDir: resolve(ROOT, e.YADORI_DATA_DIR ?? 'data'),
    modelsDir: resolve(ROOT, 'models'),
    runsDir: resolve(ROOT, 'deployments/runs'),
    dailyCapUsd: Number(e.YADORI_DAILY_CAP_USD ?? 3),
  };
}

export const SETUP_KEY = 'Setup required: MODEL_API_KEY (Meta Model API key from dev.meta.ai, in projects/yadori/.env)';
