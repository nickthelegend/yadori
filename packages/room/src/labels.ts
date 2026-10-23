/**
 * Semantic labels from the WebXR registry (github.com/immersive-web/semantic-labels).
 * Quest's room model reports furniture-sized boxes from Space Setup, so these are what a
 * headset can wake. `other` and unknown labels need the user to name the thing.
 */
export const WAKEABLE_LABELS = [
  'table',
  'couch',
  'lamp',
  'plant',
  'screen',
  'bed',
  'storage',
  'shelf',
  'chair',
  'desk',
  'cabinet',
  'door',
  'window',
  'picture',
] as const;

/** Room structure: never wakes (you cannot wake a wall, and the floor is everyone's). */
export const STRUCTURE_LABELS = ['wall', 'floor', 'ceiling', 'global mesh', 'wall art'] as const;

export type LabelKind = 'wakeable' | 'needs-name' | 'structure';

export function normaliseLabel(raw: string | undefined | null): string {
  return (raw ?? '').trim().toLowerCase().replace(/_/g, ' ');
}

export function labelKind(raw: string | undefined | null): LabelKind {
  const l = normaliseLabel(raw);
  if ((STRUCTURE_LABELS as readonly string[]).includes(l)) return 'structure';
  if ((WAKEABLE_LABELS as readonly string[]).includes(l)) return 'wakeable';
  return 'needs-name';
}

/** Chip text for a hovered object: "couch · 2.0 × 0.9 m" or "Tell me what this is". */
export function chipText(raw: string | undefined | null, w: number, h: number): string {
  const kind = labelKind(raw);
  if (kind === 'needs-name') return 'Tell me what this is';
  if (kind === 'structure') return normaliseLabel(raw);
  return `${normaliseLabel(raw)} · ${w.toFixed(1)} × ${h.toFixed(1)} m`;
}

/** A name the user typed or said for an unlabelled thing: short, letters and spaces. */
export function cleanUserLabel(input: string): string | null {
  const s = input
    .toLowerCase()
    .replace(/[^a-z \-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the|my|this is a|this is an|this is|it is a|it's a)\s+/, '');
  if (s.length < 2 || s.length > 32) return null;
  return s;
}
