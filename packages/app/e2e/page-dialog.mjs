import { args } from './page-args.mjs';
// Answer the "Tell me what this is" form with {answer} (real typing and a click).
export default async function run({ frame, workspaceRoot }) {
  const a = args(workspaceRoot);
  const input = frame.locator('#y-name');
  await input.waitFor({ timeout: 10000 });
  await input.pressSequentially(a.answer, { delay: 15 });
  await frame.locator('#y-naming button[type=submit]').click();
  return true;
}
