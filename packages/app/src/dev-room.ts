/**
 * In the IWER emulator (desktop, no headset) load our own synthetic rooms instead of the
 * default one: `yadori_den` (couch, lamp, plant, table, screen, all labelled) or
 * `yadori_bare` (one unlabelled box). Pick with ?room=den|bare|sunlit_living_room.
 * The room files are generated from src/den/den.ts by scripts/build-rooms.mjs.
 * Without IWER (a real headset) this does nothing: the room is your room.
 */
interface SemLike {
  addEnvironment(id: string, url: string): void;
  loadDefaultEnvironment(id: string): Promise<void> | void;
  environments?: string[];
}

export function emulatorPresent(): boolean {
  return !!(window as unknown as { IWER_DEVICE?: unknown }).IWER_DEVICE;
}

export function requestedRoom(): string {
  const r = new URLSearchParams(location.search).get('room') ?? 'den';
  if (r === 'den' || r === 'bare') return `yadori_${r}`;
  return r;
}

export async function loadEmulatorRoom(): Promise<string | null> {
  const room = requestedRoom();
  for (let i = 0; i < 50; i++) {
    const dev = (window as unknown as { IWER_DEVICE?: { sem?: SemLike } }).IWER_DEVICE;
    const sem = dev?.sem;
    if (sem) {
      const base = import.meta.env.BASE_URL;
      for (const id of ['yadori_den', 'yadori_bare']) {
        try {
          sem.addEnvironment(id, new URL(`${base}rooms/${id}.glts`, location.href).href);
        } catch {
          /* already added */
        }
      }
      await sem.loadDefaultEnvironment(room);
      return room;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
