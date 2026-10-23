import { args } from './page-args.mjs';
// Type a puppet line into the compose strip with real key presses: {speaker, text, to?}
export default async function run({ frame, workspaceRoot }) {
  const a = args(workspaceRoot);
  await frame.locator('[data-speaker]', { hasText: a.speaker }).click();
  if (a.to) await frame.locator('#y-to').selectOption({ label: a.to });
  const input = frame.locator('#y-text');
  await input.click();
  await input.pressSequentially(a.text, { delay: a.delay ?? 12 });
  await frame.locator('#y-send').click();
  return true;
}
