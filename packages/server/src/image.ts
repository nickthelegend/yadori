/**
 * Muse Image character sheet: one base face (generations), then edits that reference the
 * base face for the other 4 expressions and the 5 mouth shapes: 9 edits, 10 images,
 * ≈ $0.10 per object at $0.01 per image.
 *
 * UNVERIFIED until a key exists: the edits request shape. The docs say edits take 1-10
 * reference `images` and no `mask`; we send OpenAI-compatible multipart (`image[]` files).
 * Part cutting with SAM 3.1 ("cartoon eye", "cartoon mouth") is not wired yet: the app
 * plays the sheet as whole-face frames.
 */
import { writeFileSync } from 'node:fs';
import { type MetaClient, SetupRequired } from './meta.ts';
import { PRICES } from './runlog.ts';
import type { Persona } from './spark.ts';
import type { Store } from './store.ts';

export const SHEET_EXPRESSIONS = ['neutral', 'happy', 'surprised', 'grumpy', 'sleepy'] as const;
export const SHEET_MOUTHS = ['rest', 'A', 'O', 'E', 'M'] as const;
export const SHEET_IMAGES = 1 + (SHEET_EXPRESSIONS.length - 1) + SHEET_MOUTHS.length;

const EXPR_TEXT: Record<string, string> = {
  happy: 'happy, eyes closed in two upward arcs, big smile',
  surprised: 'surprised, eyes wide, small round open mouth, eyebrows raised',
  grumpy: 'grumpy, eyebrows angled down, frowning',
  sleepy: 'sleepy, eyes half closed, relaxed',
};
const MOUTH_TEXT: Record<string, string> = {
  rest: 'mouth closed, neutral',
  A: 'mouth wide open as when saying "ah"',
  O: 'mouth a small round "o"',
  E: 'mouth wide and flat as when saying "ee"',
  M: 'lips pressed together as when saying "m"',
};

export function basePrompt(p: Persona, label: string): string {
  return `A friendly cartoon face for the spirit of a ${label}, named ${p.name}: ${p.face_style}. Only the face: two eyes, eyebrows, a mouth and rosy cheeks, bold dark outlines, flat colours, front view, centred, on a plain white background. No body, no text, no logos.`;
}

function b64Of(data: any): string {
  const b = data?.data?.[0]?.b64_json;
  if (typeof b !== 'string' || !b) throw new Error('Muse Image returned no image');
  return b;
}

export async function generateSheet(
  meta: MetaClient,
  model: string,
  store: Store,
  id: string,
  persona: Persona,
  label: string,
): Promise<{ expressions: Record<string, string>; mouths: Record<string, string> }> {
  if (!meta.ready) throw new SetupRequired('image');
  const url = (name: string) => `/api/spirits/${id}/sheet/${name}`;
  const base = b64Of(
    await meta.json(
      '/images/generations',
      { model, prompt: basePrompt(persona, label), n: 1, size: '1024x1024', response_format: 'b64_json', output_format: 'png' },
      { kind: 'image.base', model, costUsd: () => PRICES.image, timeoutMs: 120000 },
    ),
  );
  writeFileSync(store.sheetFile(id, 'neutral.png'), Buffer.from(base, 'base64'));
  const out = { expressions: { neutral: url('neutral.png') } as Record<string, string>, mouths: {} as Record<string, string> };
  const edit = async (prompt: string) =>
    b64Of(
      await meta.form(
        '/images/edits',
        () => {
          const fd = new FormData();
          fd.set('model', model);
          fd.set('prompt', `The same face, same style, colours and framing, on white. Now: ${prompt}.`);
          fd.set('response_format', 'b64_json');
          fd.set('output_format', 'png');
          fd.append('image[]', new Blob([Buffer.from(base, 'base64')], { type: 'image/png' }), 'base.png');
          return fd;
        },
        { kind: 'image.edit', model, costUsd: () => PRICES.image, timeoutMs: 120000 },
      ),
    );
  for (const e of SHEET_EXPRESSIONS.slice(1)) {
    const b = await edit(EXPR_TEXT[e]);
    writeFileSync(store.sheetFile(id, `${e}.png`), Buffer.from(b, 'base64'));
    out.expressions[e] = url(`${e}.png`);
  }
  for (const m of SHEET_MOUTHS) {
    const b = await edit(MOUTH_TEXT[m]);
    const name = `mouth-${m.toLowerCase()}.png`;
    writeFileSync(store.sheetFile(id, name), Buffer.from(b, 'base64'));
    out.mouths[m] = url(name);
  }
  return out;
}
