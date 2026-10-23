/**
 * Spirit store: data/spirits/<id>/{persona.json, memory.json, meta.json, sheet/*.png}.
 * `forget` deletes the whole folder. Camera frames are never written here (only a chosen
 * crop, and only on the camera path).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Persona } from './spark.ts';

export interface SpiritMeta {
  spirit_id: string;
  label: string;
  dims: [number, number, number];
  face: 'built-in' | 'sheet';
  source: 'label' | 'camera';
  created: string;
}

export class Store {
  constructor(private dir: string) {}

  private path(id: string, ...parts: string[]): string {
    if (!/^sp_[a-z0-9]{12}$/.test(id)) throw new Error('bad spirit id');
    return resolve(this.dir, 'spirits', id, ...parts);
  }

  newId(): string {
    return `sp_${randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x').slice(0, 12)}`;
  }

  create(meta: SpiritMeta, persona: Persona | null): void {
    mkdirSync(this.path(meta.spirit_id), { recursive: true });
    writeFileSync(this.path(meta.spirit_id, 'meta.json'), JSON.stringify(meta, null, 2));
    if (persona) writeFileSync(this.path(meta.spirit_id, 'persona.json'), JSON.stringify(persona, null, 2));
    writeFileSync(this.path(meta.spirit_id, 'memory.json'), '[]');
  }

  exists(id: string): boolean {
    try {
      return existsSync(this.path(id, 'meta.json'));
    } catch {
      return false;
    }
  }

  meta(id: string): SpiritMeta | null {
    try {
      return JSON.parse(readFileSync(this.path(id, 'meta.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  persona(id: string): Persona | null {
    try {
      return JSON.parse(readFileSync(this.path(id, 'persona.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  memories(id: string): string[] {
    try {
      return JSON.parse(readFileSync(this.path(id, 'memory.json'), 'utf8'));
    } catch {
      return [];
    }
  }

  remember(id: string, fact: string): number {
    const m = this.memories(id);
    m.push(fact.slice(0, 200));
    while (m.length > 30) m.shift();
    writeFileSync(this.path(id, 'memory.json'), JSON.stringify(m, null, 2));
    return m.length;
  }

  sheetFile(id: string, name: string): string {
    if (!/^[a-z0-9_-]{1,32}\.png$/.test(name)) throw new Error('bad sheet name');
    const dir = this.path(id, 'sheet');
    mkdirSync(dir, { recursive: true });
    return resolve(dir, name);
  }

  list(): SpiritMeta[] {
    const root = resolve(this.dir, 'spirits');
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .map((id) => this.meta(id))
      .filter((m): m is SpiritMeta => !!m);
  }

  /** Deletes persona, memory, sheet, crop: everything about the spirit. */
  forget(id: string): boolean {
    let p: string;
    try {
      p = this.path(id);
    } catch {
      return false;
    }
    if (!existsSync(p)) return false;
    rmSync(p, { recursive: true, force: true });
    return true;
  }
}
