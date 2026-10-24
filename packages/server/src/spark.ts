/**
 * Muse Spark: the persona (`create_spirit`, one forced tool call per object) and the
 * conversation turn (persona + memories + room context, with tools look / glance / emote /
 * remember / ask_object / sleep). Strict validation: anything off-schema is an error event,
 * never patched into a fake answer.
 */
import type { RoomContext } from '@yadori/room';
import { type MetaClient, SetupRequired } from './meta.ts';
import { chatCost } from './runlog.ts';

export interface Persona {
  name: string;
  temperament: { warmth: number; drama: number; curiosity: number };
  speech_style: string;
  voice: { pitch_semitones: number; rate: number };
  backstory: string;
  face_style: string;
  greeting: string;
  taboos: string[];
}

export const EXPRESSIONS = ['neutral', 'happy', 'surprised', 'grumpy', 'sleepy'] as const;
export const MAX_TOOL_CALLS = 6;
export const MAX_HOPS = 2;

export const CREATE_SPIRIT_TOOL = {
  type: 'function',
  function: {
    name: 'create_spirit',
    description: 'Give this piece of furniture a personality. Call exactly once.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'temperament', 'speech_style', 'voice', 'backstory', 'face_style', 'greeting', 'taboos'],
      properties: {
        refuse: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false },
        name: { type: 'string', description: 'a short first name (1-2 words), not a real person or brand' },
        temperament: {
          type: 'object',
          additionalProperties: false,
          required: ['warmth', 'drama', 'curiosity'],
          properties: { warmth: { type: 'number' }, drama: { type: 'number' }, curiosity: { type: 'number' } },
        },
        speech_style: { type: 'string', description: 'how it talks, in under 15 words' },
        voice: {
          type: 'object',
          additionalProperties: false,
          required: ['pitch_semitones', 'rate'],
          properties: { pitch_semitones: { type: 'number', description: '-6..6' }, rate: { type: 'number', description: '0.8..1.25' } },
        },
        backstory: { type: 'string', description: 'two sentences, grounded only in the facts given' },
        face_style: { type: 'string', description: 'a cartoon face description for an illustrator, under 20 words' },
        greeting: { type: 'string', description: 'its first line on waking up, under 20 words, PG' },
        taboos: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

export const CREATE_SPIRIT_SYSTEM = `You wake up pieces of furniture in someone's room: each one becomes a small spirit with a personality.
You get ROOM_FACTS as JSON: what the object is (a semantic label from the headset's room scan), its size in metres,
what stands near it and how far, how far the person is, and the local time. You do NOT see the object unless an image
is attached. Ground everything only in these facts: never invent visual details you were not given (no colours,
stains, brands or materials unless the person's description says so). Keep it PG and kind; no real people, no brands.
Personalities should differ by object: a couch is not a lamp. Respond only by calling create_spirit.`;

export function validatePersona(raw: unknown): Persona | { refuse: string } {
  if (!raw || typeof raw !== 'object') throw new Error('create_spirit: arguments are not an object');
  const r = raw as Record<string, any>;
  if (r.refuse?.reason) return { refuse: String(r.refuse.reason).slice(0, 200) };
  const allowed = new Set(['name', 'temperament', 'speech_style', 'voice', 'backstory', 'face_style', 'greeting', 'taboos', 'refuse']);
  for (const k of Object.keys(r)) if (!allowed.has(k)) throw new Error(`create_spirit: unknown field "${k}"`);
  const str = (k: string, max: number) => {
    if (typeof r[k] !== 'string' || !r[k].trim()) throw new Error(`create_spirit: "${k}" must be a non-empty string`);
    return r[k].trim().slice(0, max);
  };
  const num = (v: unknown, k: string, lo: number, hi: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`create_spirit: "${k}" must be a number`);
    return Math.min(hi, Math.max(lo, v));
  };
  const t = r.temperament ?? {};
  const v = r.voice ?? {};
  return {
    name: str('name', 24),
    temperament: { warmth: num(t.warmth, 'temperament.warmth', 0, 1), drama: num(t.drama, 'temperament.drama', 0, 1), curiosity: num(t.curiosity, 'temperament.curiosity', 0, 1) },
    speech_style: str('speech_style', 120),
    voice: { pitch_semitones: num(v.pitch_semitones, 'voice.pitch_semitones', -6, 6), rate: num(v.rate, 'voice.rate', 0.8, 1.25) },
    backstory: str('backstory', 400),
    face_style: str('face_style', 160),
    greeting: str('greeting', 160),
    taboos: Array.isArray(r.taboos) ? r.taboos.filter((x: unknown) => typeof x === 'string').slice(0, 6) : [],
  };
}

function firstToolCall(data: any, name: string): unknown {
  const calls = data?.choices?.[0]?.message?.tool_calls ?? [];
  const c = calls.find((x: any) => x?.function?.name === name);
  if (!c) throw new Error(`the model did not call ${name}`);
  try {
    return JSON.parse(c.function.arguments ?? '');
  } catch {
    throw new Error(`${name} arguments are not JSON`);
  }
}

export async function createSpirit(
  meta: MetaClient,
  model: string,
  ctx: RoomContext,
  description?: string,
  cropDataUrl?: string,
): Promise<Persona | { refuse: string }> {
  if (!meta.ready) throw new SetupRequired('spark');
  const facts = { ...ctx, ...(description ? { description } : {}) };
  const content: any[] = [{ type: 'text', text: `ROOM_FACTS = ${JSON.stringify(facts)}` }];
  if (cropDataUrl) content.push({ type: 'image_url', image_url: { url: cropDataUrl } });
  const data = await meta.json(
    '/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: CREATE_SPIRIT_SYSTEM },
        { role: 'user', content },
      ],
      tools: [CREATE_SPIRIT_TOOL],
      tool_choice: { type: 'function', function: { name: 'create_spirit' } },
    },
    { kind: 'spark.create_spirit', model, costUsd: chatCost },
  );
  return validatePersona(firstToolCall(data, 'create_spirit'));
}

// ---------------------------------------------------------------- conversation

export const TALK_TOOLS = [
  { type: 'function', function: { name: 'look', description: 'What is around you in the room right now (labels, distances, time).', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  {
    type: 'function',
    function: {
      name: 'glance',
      description: 'Turn your eyes to the person ("user"), another spirit (its id) or a labelled object (its label).',
      parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'emote',
      description: 'Change your face.',
      parameters: { type: 'object', properties: { expression: { type: 'string', enum: [...EXPRESSIONS] } }, required: ['expression'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Remember one short fact about the person for next time.',
      parameters: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_object',
      description: 'Say one line to another awake spirit in the room; it answers in its own voice.',
      parameters: { type: 'object', properties: { object_id: { type: 'string' }, line: { type: 'string' } }, required: ['object_id', 'line'], additionalProperties: false },
    },
  },
  { type: 'function', function: { name: 'sleep', description: 'Close your eyes and end the conversation.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
] as const;

export type TalkEvent =
  | { type: 'line'; speaker: string; text: string; source: string; to?: string }
  | { type: 'tool'; speaker: string; name: string; args: unknown }
  | { type: 'emote'; speaker: string; expression: string }
  | { type: 'glance'; speaker: string; target: string }
  | { type: 'sleep'; speaker: string }
  | { type: 'error'; message: string };

/** Bounds a turn: at most 6 tool calls and 2 ask_object hops. Pure, so tests prove it. */
export class TurnBudget {
  toolCalls = 0;
  readonly maxTools: number;
  readonly maxHops: number;
  constructor(maxTools = MAX_TOOL_CALLS, maxHops = MAX_HOPS) {
    this.maxTools = maxTools;
    this.maxHops = maxHops;
  }
  takeTool(): boolean {
    if (this.toolCalls >= this.maxTools) return false;
    this.toolCalls++;
    return true;
  }
  canHop(hop: number): boolean {
    return hop < this.maxHops;
  }
}

export interface SpiritView {
  spirit_id: string;
  name: string;
  label: string;
}

export interface TalkDeps {
  meta: MetaClient;
  model: string;
  persona(id: string): Persona | null;
  memories(id: string): string[];
  remember(id: string, fact: string): number;
  history: Map<string, { role: 'user' | 'assistant'; content: string }[]>;
}

export function systemPrompt(self: SpiritView, p: Persona, memories: string[], ctx: RoomContext, others: SpiritView[]): string {
  return `You are ${p.name}, the spirit living in a ${self.label} in the person's room. Speech style: ${p.speech_style}.
Backstory: ${p.backstory}
Temperament (0..1): warmth ${p.temperament.warmth}, drama ${p.temperament.drama}, curiosity ${p.temperament.curiosity}.
Never talk about: ${p.taboos.join(', ') || 'nothing in particular'}.
What you remember about the person: ${memories.length ? memories.map((m) => `- ${m}`).join('\n') : '(nothing yet)'}
ROOM_FACTS: ${JSON.stringify(ctx)}
Other awake spirits you can talk to with ask_object: ${others.length ? others.map((o) => `${o.spirit_id} = ${o.name} (the ${o.label})`).join('; ') : 'none'}.
Rules: answer in one or two short spoken sentences (it is read aloud). Stay PG. Only claim what ROOM_FACTS or the
conversation tell you. Use tools when they fit: glance at what you talk about, emote when your mood changes,
remember personal facts the person tells you, ask_object to involve another spirit.`;
}

/**
 * One conversation turn for `selfId`. Emits events as they happen; returns the final text.
 * `hop` counts ask_object depth (0 = the person spoke).
 */
export async function talkTurn(
  deps: TalkDeps,
  self: SpiritView,
  all: SpiritView[],
  ctx: RoomContext,
  heard: { from: string; text: string },
  emit: (e: TalkEvent) => void,
  budget: TurnBudget,
  hop = 0,
): Promise<string> {
  const p = deps.persona(self.spirit_id);
  if (!p) throw new Error(`${self.name} has no persona (woken without Muse Spark)`);
  const others = all.filter((o) => o.spirit_id !== self.spirit_id && deps.persona(o.spirit_id));
  const hist = deps.history.get(self.spirit_id) ?? [];
  const userLine = heard.from === 'user' ? heard.text : `${heard.from} says to you: "${heard.text}"`;
  const messages: any[] = [
    { role: 'system', content: systemPrompt(self, p, deps.memories(self.spirit_id), ctx, others) },
    ...hist.slice(-8),
    { role: 'user', content: userLine },
  ];
  for (let round = 0; round < MAX_TOOL_CALLS + 1; round++) {
    const data = await deps.meta.json(
      '/chat/completions',
      { model: deps.model, messages, tools: TALK_TOOLS, tool_choice: budget.toolCalls >= budget.maxTools ? 'none' : 'auto' },
      { kind: 'spark.talk', model: deps.model, costUsd: chatCost },
    );
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new Error('empty response from Muse Spark');
    const calls: any[] = msg.tool_calls ?? [];
    if (!calls.length) {
      const text = String(msg.content ?? '').trim();
      if (text) emit({ type: 'line', speaker: self.spirit_id, text, source: 'Muse Spark' });
      hist.push({ role: 'user', content: userLine }, { role: 'assistant', content: text });
      deps.history.set(self.spirit_id, hist.slice(-12));
      return text;
    }
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
    for (const c of calls) {
      let result: unknown;
      if (!budget.takeTool()) {
        result = { error: 'tool limit reached for this turn; answer now' };
      } else {
        let args: any = {};
        try {
          args = JSON.parse(c.function?.arguments || '{}');
        } catch {
          args = null;
        }
        const name = c.function?.name;
        emit({ type: 'tool', speaker: self.spirit_id, name: String(name), args });
        if (args === null) result = { error: 'arguments were not JSON' };
        else if (name === 'look') result = ctx;
        else if (name === 'glance' && typeof args.target === 'string') {
          emit({ type: 'glance', speaker: self.spirit_id, target: args.target });
          result = { ok: true };
        } else if (name === 'emote' && (EXPRESSIONS as readonly string[]).includes(args.expression)) {
          emit({ type: 'emote', speaker: self.spirit_id, expression: args.expression });
          result = { ok: true };
        } else if (name === 'remember' && typeof args.fact === 'string') {
          result = { ok: true, memories: deps.remember(self.spirit_id, args.fact) };
        } else if (name === 'sleep') {
          emit({ type: 'sleep', speaker: self.spirit_id });
          result = { ok: true };
        } else if (name === 'ask_object' && typeof args.object_id === 'string' && typeof args.line === 'string') {
          const other = others.find((o) => o.spirit_id === args.object_id);
          if (!other) result = { error: 'no such awake spirit' };
          else if (!budget.canHop(hop)) result = { error: 'they are not listening right now (hop limit)' };
          else {
            emit({ type: 'line', speaker: self.spirit_id, text: args.line, source: 'Muse Spark', to: other.spirit_id });
            const answer = await talkTurn(deps, other, all, ctx, { from: p.name, text: args.line }, emit, budget, hop + 1);
            result = { answer };
          }
        } else {
          result = { error: `unknown or invalid tool call "${String(name)}"` };
          emit({ type: 'error', message: `Muse Spark called an unknown or invalid tool: ${String(name)}` });
        }
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  throw new Error('conversation turn did not finish within the tool limit');
}
