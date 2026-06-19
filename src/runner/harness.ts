import { $ } from 'bun';
import type { Commands, HarnessName } from '../types.ts';

export async function runHarness(
  harnessName: HarnessName,
  prompt: string,
  modelName: string,
  cwd: string,
  commands: Commands,
): Promise<void> {
  const template = commands.harnesses[harnessName];
  if (!template) {
    throw new Error(`No harness command configured for '${harnessName}'. Add it to commands.harnesses in bench.config.ts.`);
  }
  const cmd = template.replace('{modelName}', modelName);
  await $`sh -c ${cmd}`.env({ ...process.env, THUNDERJAR_PROMPT: prompt }).cwd(cwd);
}
