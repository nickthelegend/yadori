import { args } from './page-args.mjs';
// Answer the next "Tell me what this is" prompt with {answer}.
export default async function run({ page, workspaceRoot }) {
  const a = args(workspaceRoot);
  page.once('dialog', (d) => void d.accept(a.answer));
  return true;
}
