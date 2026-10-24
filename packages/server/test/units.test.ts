process.env.YADORI_NO_RUNLOG = '1'; // the budget test must not write into the real run log
import { describe, expect, it } from 'vitest';
import { BudgetExceeded, assertBudget, chatCost, logRun, spent } from '../src/runlog.ts';
import { boxOverlap, parseSam } from '../src/sam.ts';
import { MAX_HOPS, MAX_TOOL_CALLS, TALK_TOOLS, TurnBudget, validatePersona } from '../src/spark.ts';
import { resample, wav16, weightsPresent } from '../src/tts.ts';
import { wavSeconds } from '../src/voice-in.ts';
import { SHEET_IMAGES, basePrompt } from '../src/image.ts';

const persona = {
  name: 'Mossby',
  temperament: { warmth: 0.8, drama: 0.4, curiosity: 0.6 },
  speech_style: 'slow, comfy, a bit smug',
  voice: { pitch_semitones: -3, rate: 0.9 },
  backstory: 'Two metres of couch by the lamp. Has heard every secret told on it.',
  face_style: 'sleepy round eyes, soft smile',
  greeting: 'Mm? Oh. You again. Sit, sit.',
  taboos: ['crumbs'],
};

describe('persona validation (create_spirit)', () => {
  it('accepts a valid persona', () => {
    expect(validatePersona(persona)).toEqual(persona);
  });
  it('rejects unknown fields and missing strings', () => {
    expect(() => validatePersona({ ...persona, secret: 1 })).toThrow(/unknown field/);
    expect(() => validatePersona({ ...persona, name: '' })).toThrow(/name/);
    expect(() => validatePersona({ ...persona, voice: { pitch_semitones: 'high', rate: 1 } })).toThrow(/pitch/);
  });
  it('clamps voice and temperament ranges', () => {
    const p = validatePersona({ ...persona, voice: { pitch_semitones: 40, rate: 9 }, temperament: { warmth: 2, drama: -1, curiosity: 0.5 } });
    expect('name' in p && p.voice).toEqual({ pitch_semitones: 6, rate: 1.25 });
    expect('name' in p && p.temperament).toEqual({ warmth: 1, drama: 0, curiosity: 0.5 });
  });
  it('passes a refusal through', () => {
    expect(validatePersona({ refuse: { reason: 'that is a person' } })).toEqual({ refuse: 'that is a person' });
  });
});

describe('turn budget (banter is bounded)', () => {
  it('allows 6 tool calls per turn, then none', () => {
    const b = new TurnBudget();
    const took = Array.from({ length: 9 }, () => b.takeTool());
    expect(took.filter(Boolean).length).toBe(MAX_TOOL_CALLS);
    expect(took.slice(MAX_TOOL_CALLS).every((x) => !x)).toBe(true);
  });
  it('ask_object stops at 2 hops', () => {
    const b = new TurnBudget();
    expect(MAX_HOPS).toBe(2);
    expect([0, 1, 2, 3].map((h) => b.canHop(h))).toEqual([true, true, false, false]);
  });
  it('exposes exactly the six spec tools with strict schemas', () => {
    expect(TALK_TOOLS.map((t) => t.function.name)).toEqual(['look', 'glance', 'emote', 'remember', 'ask_object', 'sleep']);
    for (const t of TALK_TOOLS) expect(t.function.parameters.additionalProperties).toBe(false);
  });
});

describe('SAM 3.1 output parsing (documented token grammar)', () => {
  it('parses boxes, confidences and passes the mask through untouched', () => {
    const text = '<0f>0<|box;x1=10;y1=20;x2=110;y2=220;w=640;h=480;c=0.93|><|mask;x=0;y=0;data=480,640,!abc~|>,1<|box;x1=300;y1=40;x2=360;y2=200;w=640;h=480;c=0.41|>';
    const r = parseSam(text);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ id: 0, box: [10, 20, 110, 220], score: 0.93, mask_raw: '480,640,!abc~' });
    expect(r[1].mask_raw).toBeNull();
  });
  it('returns nothing for text without boxes', () => {
    expect(parseSam('no objects found')).toEqual([]);
    expect(parseSam('<0f>')).toEqual([]);
  });
  it('measures how much of a box another box covers', () => {
    expect(boxOverlap([0, 0, 10, 10], [5, 0, 15, 10])).toBeCloseTo(0.5);
    expect(boxOverlap([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
  });
});

describe('audio helpers', () => {
  it('writes a valid 16-bit mono WAV that the transcribe check accepts', () => {
    const wav = wav16(new Float32Array(16000), 16000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wavSeconds(wav)).toBeCloseTo(1, 6);
  });
  it('rejects audio the transcribe endpoint would not take', () => {
    expect(() => wavSeconds(Buffer.from('hello'))).toThrow(/WAV/);
    expect(() => wavSeconds(wav16(new Float32Array(100), 44100))).toThrow(/16 or 24 kHz/);
  });
  it('resampling up raises pitch and shortens', () => {
    const x = new Float32Array(1000).map((_, i) => Math.sin(i / 10));
    expect(resample(x, 2).length).toBe(500);
    expect(resample(x, 0.5).length).toBe(2000);
  });
  it('reports missing MMS-TTS weights', () => {
    expect(weightsPresent('/nonexistent/models')).toBe(false);
  });
});

describe('cost and budget', () => {
  it('prices a chat from usage', () => {
    expect(chatCost({ usage: { prompt_tokens: 1e6, completion_tokens: 1e6 } })).toBeCloseTo(5.5);
    expect(chatCost({})).toBe(0);
  });
  it('the sheet is 10 images (the base face doubles as neutral) and asks for a face only', () => {
    expect(SHEET_IMAGES).toBe(10);
    expect(basePrompt(validatePersona(persona) as any, 'couch')).toMatch(/Only the face/);
  });
  it('stops at the daily cap', () => {
    const before = spent();
    logRun({ kind: 'test', model: 'x', ok: true, latency_ms: 1, cost_usd: 0.5 });
    expect(spent()).toBeCloseTo(before + 0.5);
    expect(() => assertBudget(before + 0.6, 0.2)).toThrow(BudgetExceeded);
    expect(() => assertBudget(before + 1, 0.2)).not.toThrow();
  });
});
