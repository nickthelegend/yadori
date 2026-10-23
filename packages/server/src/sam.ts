/**
 * SAM 3.1 on one image (the camera path's wake frame): concept prompt (the semantic label,
 * e.g. "lamp") and a second prompt "person" for the people check. The frame is passed in
 * memory and never written to disk.
 *
 * Wire format from /docs/sam/segmenting: POST /v1/responses with an input_text + input_image;
 * the answer is special-token text '<0f>' then records 'id<|box;x1=..;y1=..;x2=..;y2=..;...|>'
 * optionally followed by '<|mask;...;data=...|>'. Boxes are parsed here; mask `data` decoding
 * is UNVERIFIED (documented on /docs/sam/reading-segmentation, not readable without a key),
 * so the raw mask string is passed through untouched and the app uses the box.
 */
import { type MetaClient, SetupRequired } from './meta.ts';
import { PRICES } from './runlog.ts';

export interface SamBox {
  id: number;
  box: [number, number, number, number];
  score: number | null;
  mask_raw: string | null;
}

const TOKEN = /<\|(box|mask);([^|]*)\|>/g;

export function parseSam(text: string): SamBox[] {
  const out: SamBox[] = [];
  const body = text.replace(/^[\s\S]*?<0f>/, '');
  for (const rec of body.split(/,(?=\d+<\|)/)) {
    const idm = /^\s*(\d+)/.exec(rec);
    if (!idm) continue;
    const item: SamBox = { id: Number(idm[1]), box: [0, 0, 0, 0], score: null, mask_raw: null };
    let hasBox = false;
    for (const m of rec.matchAll(TOKEN)) {
      const kv: Record<string, string> = {};
      for (const part of m[2].split(';')) {
        const i = part.indexOf('=');
        if (i > 0) kv[part.slice(0, i)] = part.slice(i + 1);
      }
      if (m[1] === 'box') {
        const n = (k: string) => Number(kv[k]);
        if ([n('x1'), n('y1'), n('x2'), n('y2')].every(Number.isFinite)) {
          item.box = [n('x1'), n('y1'), n('x2'), n('y2')];
          hasBox = true;
        }
        if (kv.c !== undefined && Number.isFinite(Number(kv.c))) item.score = Number(kv.c);
      } else item.mask_raw = kv.data ?? null;
    }
    if (hasBox) out.push(item);
  }
  return out;
}

export function boxOverlap(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = x * y;
  const area = Math.max(1e-9, (a[2] - a[0]) * (a[3] - a[1]));
  return inter / area;
}

function outputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts: string[] = [];
  for (const o of data?.output ?? []) for (const c of o?.content ?? []) if (typeof c?.text === 'string') parts.push(c.text);
  return parts.join('');
}

export async function segment(meta: MetaClient, model: string, jpegB64: string, prompt: string): Promise<SamBox[]> {
  if (!meta.ready) throw new SetupRequired('sam3');
  const data = await meta.json(
    '/responses',
    {
      model,
      stream: false,
      metadata: { mask_encoding: 'one_bit', include_confidence: 'true' },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: `data:image/jpeg;base64,${jpegB64}` },
          ],
        },
      ],
    },
    { kind: 'sam.image', model, costUsd: () => PRICES.samImage },
  );
  return parseSam(outputText(data));
}
