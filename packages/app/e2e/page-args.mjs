import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// browser-run scripts take no arguments; the orchestrator writes e2e/.args.json first
export function args(workspaceRoot) {
  return JSON.parse(readFileSync(join(workspaceRoot, 'e2e', '.args.json'), 'utf8'));
}
