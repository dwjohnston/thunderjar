import { $ } from 'bun';

export async function clean(_args: string[]): Promise<void> {
  const result = await $`git worktree list --porcelain`.text();
  const worktrees = result
    .split('\n\n')
    .map(block => block.trim())
    .filter(block => block.includes('worktree') && block.includes('/tmp/thunderjar-'));

  if (worktrees.length === 0) {
    console.log('No stale thunderjar worktrees found.');
    return;
  }

  for (const block of worktrees) {
    const worktreePath = block.split('\n')[0]!.replace('worktree ', '');
    console.log(`Removing worktree: ${worktreePath}`);
    await $`git worktree remove --force ${worktreePath}`;
  }

  console.log('Done.');
}
