/**
 * Run log: one JSON line per Meta call (model id, request id, latency, estimated cost) in
 * deployments/runs/<date>.jsonl. Never contains the key, prompts or audio.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.ts';

export interface RunEntry {
  kind: string;
  model: string;
  ok: boolean;
  latency_ms: number;
  request_id?: string | null;
  cost_usd?: number;
  error?: string;
}

let spentToday = 0;
let spentDay = '';

export function spent(): number {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== spentDay) {
    spentDay = day;
    spentToday = 0;
  }
  return spentToday;
}

export function logRun(e: RunEntry): void {
  spent();
  spentToday += e.cost_usd ?? 0;
  if (process.env.YADORI_NO_RUNLOG) return;
  try {
    const dir = config().runsDir;
    mkdirSync(dir, { recursive: true });
    appendFileSync(resolve(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify({ t: new Date().toISOString(), ...e })}\n`);
  } catch {
    /* logging must never break a request */
  }
}

/** Published prices (dev.meta.ai pricing page, checked Oct 24, 2026). */
export const PRICES = {
  sparkIn: 1.25 / 1e6,
  sparkOut: 4.25 / 1e6,
  image: 0.01,
  samImage: 2.5 / 1000,
  transcribeHour: 0.18,
};

export function chatCost(data: any): number {
  const u = data?.usage;
  if (!u) return 0;
  return (u.prompt_tokens ?? 0) * PRICES.sparkIn + (u.completion_tokens ?? 0) * PRICES.sparkOut;
}

export class BudgetExceeded extends Error {}

export function assertBudget(capUsd: number, nextCostUsd: number): void {
  if (spent() + nextCostUsd > capUsd) throw new BudgetExceeded(`Daily cap reached ($${capUsd.toFixed(2)}); try again tomorrow or raise YADORI_DAILY_CAP_USD`);
}
