import { args } from './page-args.mjs';
// Clear saved spirits and reload, optionally into another emulated room (?room=den|bare).
export default async function run({ frame, workspaceRoot }) {
  const a = args(workspaceRoot);
  await frame.evaluate((room) => {
    localStorage.removeItem('yadori.spirits.v1');
    const u = new URL(location.href);
    if (room) u.searchParams.set('room', room);
    else u.searchParams.delete('room');
    location.href = u.toString();
  }, a.room ?? null);
  return true;
}
