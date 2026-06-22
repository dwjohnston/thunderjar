import { $ } from 'bun';

export function worktreePath(runId: string): string {
  return `/tmp/thunderjar-${runId}`;
}

export async function createWorktree(runId: string, commitHash: string): Promise<string> {
  const wt = worktreePath(runId);
  await $`git worktree add ${wt} ${commitHash}`.cwd(process.cwd());
  return wt;
}

export async function removeWorktree(runId: string): Promise<void> {
  const wt = worktreePath(runId);
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
