import { $ } from 'bun';
import type { Commands } from '../types.ts';

export async function runHarness(
  harnessName: string,
  prompt: string,
  model: string,
  cwd: string,
  commands: Commands,
): Promise<void> {
  const template = commands.harnesses[harnessName];
  if (!template) {
    throw new Error(`No harness command configured for '${harnessName}'. Add it to commands.harnesses in bench.config.ts.`);
  }
  const cmd = template.replace('{model}', model);
  await $`sh -c ${cmd}`.env({ ...process.env, THUNDERJAR_PROMPT: prompt }).cwd(cwd);
}
