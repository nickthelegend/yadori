// MCP over stdio, as a real child process talking to a real gateway.
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGateway } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
let gw: Awaited<ReturnType<typeof startGateway>>;
let proc: ChildProcessWithoutNullStreams;
let next = 1;
const waiting = new Map<number, (v: any) => void>();

function rpc(method: string, params?: unknown): Promise<any> {
  const id = next++;
  return new Promise((res) => {
    waiting.set(id, res);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

beforeAll(async () => {
  gw = await startGateway();
  proc = spawn(process.execPath, [resolve(here, '../src/mcp.ts')], { env: { ...process.env, YADORI_GATEWAY: gw.url } });
  createInterface({ input: proc.stdout }).on('line', (l) => {
    const m = JSON.parse(l);
    waiting.get(m.id)?.(m);
  });
});
afterAll(async () => {
  proc.kill();
  await gw.close();
});

describe('MCP stdio', () => {
  it('initializes and lists the six tools', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    expect(init.result.serverInfo.name).toBe('yadori');
    const tools = await rpc('tools/list');
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(['status', 'wake', 'chat', 'say', 'list_spirits', 'forget']);
  });
  it('wakes, lists and forgets through the gateway; chat says Setup required', async () => {
    const w = await rpc('tools/call', { name: 'wake', arguments: { label: 'plant', dims: [0.8, 1.5, 0.8] } });
    expect(w.result.isError).toBe(false);
    const body = JSON.parse(w.result.content[0].text);
    expect(body.face).toBe('built-in');
    const c = await rpc('tools/call', { name: 'chat', arguments: { spirit_id: body.spirit_id, text: 'hi' } });
    expect(c.result.isError).toBe(true);
    expect(c.result.content[0].text).toMatch(/MODEL_API_KEY/);
    const f = await rpc('tools/call', { name: 'forget', arguments: { spirit_id: body.spirit_id } });
    expect(f.result.isError).toBe(false);
  });
  it('answers unknown methods with a JSON-RPC error', async () => {
    const r = await rpc('nope/nope');
    expect(r.error.code).toBe(-32601);
  });
});
