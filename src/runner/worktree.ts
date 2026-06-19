import { $ } from 'bun';
import path from 'path';

export function worktreePath(experimentId: string): string {
  return `/tmp/thunderjar-${experimentId}`;
}

export async function createWorktree(experimentId: string, commitHash: string): Promise<string> {
  const wt = worktreePath(experimentId);
  await $`git worktree add ${wt} ${commitHash}`.cwd(process.cwd());
  return wt;
}

export async function removeWorktree(experimentId: string): Promise<void> {
  const wt = worktreePath(experimentId);
  await $`git worktree remove --force ${wt}`.cwd(process.cwd());
}

export async function getChangedFiles(worktree: string): Promise<string[]> {
  const result = await $`git diff --name-only HEAD`.cwd(worktree).text();
  const untracked = await $`git ls-files --others --exclude-standard`.cwd(worktree).text();
  return [...result.trim().split('\n'), ...untracked.trim().split('\n')].filter(Boolean);
}

export async function getAddedLines(worktree: string): Promise<string> {
  return $`git diff HEAD`.cwd(worktree).text();
}
