import { $ } from 'bun';
import type { HarnessName } from '../types.ts';

type HarnessConfig = {
  command: (prompt: string, modelName: string) => string[];
};

const harnesses: Record<HarnessName, HarnessConfig> = {
  'claude-code': {
    command: (prompt, modelName) => ['claude', '-p', prompt, '--model', modelName],
  },
  'opencode': {
    command: (prompt, modelName) => ['opencode', 'run', '--prompt', prompt, '--model', modelName],
  },
};

export async function runHarness(
  harnessName: HarnessName,
  prompt: string,
  modelName: string,
  cwd: string,
): Promise<void> {
  const harness = harnesses[harnessName];
  const cmd = harness.command(prompt, modelName);
  const [bin, ...args] = cmd;
  await $`${bin} ${args}`.cwd(cwd);
}
