#!/usr/bin/env node
/**
 * Yadori MCP server over stdio (JSON-RPC 2.0, MCP 2025-06-18 subset: initialize,
 * tools/list, tools/call). It drives the running gateway over HTTP, so an agent sees
 * exactly what the app sees, including "Setup required".
 *   tools: status, wake, chat, say, list_spirits, forget
 * Run: pnpm --filter @yadori/server mcp   (gateway URL from YADORI_GATEWAY, default :8440)
 */
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const GW = (process.env.YADORI_GATEWAY ?? 'http://127.0.0.1:8440').replace(/\/+$/, '');

export const TOOLS = [
  { name: 'status', description: 'Which Meta models and voices are ready, and the daily budget.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'wake',
    description: 'Wake a piece of furniture by label (e.g. "couch") with its size in metres. Returns the spirit id and persona (or Setup required).',
    inputSchema: {
      type: 'object',
      required: ['label'],
      additionalProperties: false,
      properties: {
        label: { type: 'string' },
        dims: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        description: { type: 'string' },
      },
    },
  },
  {
    name: 'chat',
    description: 'Say something to a woken spirit; Muse Spark answers in its persona (needs MODEL_API_KEY).',
    inputSchema: { type: 'object', required: ['spirit_id', 'text'], additionalProperties: false, properties: { spirit_id: { type: 'string' }, text: { type: 'string' } } },
  },
  {
    name: 'say',
    description: 'Puppet mode: the spirit speaks your line with MMS-TTS (returns the audio length, not the audio).',
    inputSchema: { type: 'object', required: ['spirit_id', 'text'], additionalProperties: false, properties: { spirit_id: { type: 'string' }, text: { type: 'string' } } },
  },
  { name: 'list_spirits', description: 'All spirits the gateway stores.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'forget',
    description: 'Delete a spirit: persona, memories, sheet and crop.',
    inputSchema: { type: 'object', required: ['spirit_id'], additionalProperties: false, properties: { spirit_id: { type: 'string' } } },
  },
];

async function http(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  try {
    const r = await fetch(`${GW}${path}`, init);
    const text = await r.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* SSE or text */
    }
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: { error: `gateway offline at ${GW}: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

const post = (path: string, body: unknown) => http(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export async function callTool(name: string, args: Record<string, any>): Promise<{ status: number; body: any }> {
  switch (name) {
    case 'status':
      return http('/api/status');
    case 'wake': {
      const dims = Array.isArray(args.dims) && args.dims.length === 3 ? args.dims : [1, 1, 1];
      const ctx = {
        self: { id: 'mcp', label: String(args.label), dims_m: dims, height_of_top_m: dims[1] },
        viewer: { distance_m: 2, eye_height_m: 1.6 },
        neighbours: [],
        room: { object_count: 1, labels: [String(args.label)] },
        local_time: new Date().toTimeString().slice(0, 5),
        source: 'label',
      };
      return post('/api/wake', { mesh: { id: 'mcp', label: args.label, dims, room_context: ctx }, description: args.description });
    }
    case 'chat': {
      const r = await post('/api/chat', { spirit_id: args.spirit_id, text: args.text, room_context: {}, spirits: [] });
      if (typeof r.body === 'string') {
        const events = r.body
          .split('\n\n')
          .map((c: string) => c.replace(/^data:\s*/, '').trim())
          .filter(Boolean)
          .map((c: string) => {
            try {
              return JSON.parse(c);
            } catch {
              return { raw: c };
            }
          });
        return { status: r.status, body: { events } };
      }
      return r;
    }
    case 'say': {
      const r = await post('/api/say', { spirit_id: args.spirit_id, text: args.text });
      if (r.status === 200) return { status: 200, body: { seconds: r.body.audio?.seconds, model: r.body.model, license: r.body.license } };
      return r;
    }
    case 'list_spirits':
      return http('/api/spirits');
    case 'forget':
      return http(`/api/spirits/${encodeURIComponent(String(args.spirit_id))}`, { method: 'DELETE' });
    default:
      return { status: 404, body: { error: `unknown tool ${name}` } };
  }
}

async function onMessage(msg: any): Promise<any> {
  const { id, method, params } = msg;
  if (method === 'initialize')
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'yadori', version: '0.1.0' } } };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    const r = await callTool(params?.name, params?.arguments ?? {});
    const isError = r.status === 0 || r.status >= 400;
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r.body) }], isError } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (id === undefined) return null; // notification
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`);
      return;
    }
    const out = await onMessage(msg);
    if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
  });
}
