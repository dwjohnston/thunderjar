import path from 'node:path';
import os from 'node:os';
import type { ThunderjarConfig, Experiment, Measurement } from './types.ts';

interface RunPermutation {
  experimentId: string;
  model: string;
  harness: string;
  prompt: string;
  commitHash: string;
  worktreePath: string;
  branchName: string;
}

function generatePermutations(experimentId: string, experiment: Experiment, timestamp: string): RunPermutation[] {
  const permutations: RunPermutation[] = [];
  for (const model of experiment.variables.models) {
    for (const harness of experiment.variables.harnesses) {
      for (const prompt of experiment.variables.prompts) {
        const runId = `${experimentId}--${prompt}--${model}--${harness}`;
        const worktreePath = path.join(os.tmpdir(), 'thunderjar', `${runId}--${timestamp}`);
        const branchName = `thunderjar/${runId}--${timestamp}`;
        permutations.push({ experimentId, model, harness, prompt, commitHash: experiment.commitHash, worktreePath, branchName });
      }
    }
  }
  return permutations;
}

async function gitRoot(cwd: string): Promise<string> {
  const result = await Bun.$`git -C ${cwd} rev-parse --show-toplevel`.quiet();
  return result.stdout.toString().trim();
}

export async function runExperiment(config: ThunderjarConfig, experimentId: string, cwd: string) {
  const experiment = config.experiments[experimentId];
  if (!experiment) throw new Error(`Experiment '${experimentId}' not found`);

  const repoRoot = await gitRoot(cwd);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const permutations = generatePermutations(experimentId, experiment, timestamp);

  console.log(`\nCreating ${permutations.length} worktree(s) for '${experimentId}':\n`);

  for (const perm of permutations) {
    const label = `${perm.experimentId}--${perm.prompt}--${perm.model}--${perm.harness}`;
    process.stdout.write(`  ${label}\n    → ${perm.worktreePath} ... `);

    await Bun.$`mkdir -p ${path.dirname(perm.worktreePath)}`.quiet();
    const result = await Bun.$`git -C ${repoRoot} worktree add -b ${perm.branchName} ${perm.worktreePath} ${perm.commitHash}`.quiet().nothrow();

    if (result.exitCode === 0) {
      console.log('✓');
    } else {
      console.log('✗');
      console.error(`    ${result.stderr.toString().trim()}\n`);
    }
  }

  console.log();
}

export async function fakeRunExperiment(config: ThunderjarConfig, experimentId: string, cwd: string) {
  const experiment = config.experiments[experimentId];
  if (!experiment) throw new Error(`Experiment '${experimentId}' not found`);

  const task = config.tasks[experiment.taskId];
  if (!task) throw new Error(`Task '${experiment.taskId}' not found`);

  const repoRoot = await gitRoot(cwd);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const permutations = generatePermutations(experimentId, experiment, timestamp);
  const runDir = path.join(cwd, 'bench', 'results', `${experimentId}--${timestamp}`);

  await Bun.$`mkdir -p ${runDir}`.quiet();

  console.log(`\nFake-running ${permutations.length} permutation(s) for '${experimentId}':\n`);

  for (const perm of permutations) {
    const permLabel = `${perm.prompt}--${perm.model}--${perm.harness}`;
    const runId = `${perm.experimentId}--${permLabel}`;
    const runAt = new Date(now.getTime() + Math.random() * 1000).toISOString();
    const durationSeconds = Math.floor(60 + Math.random() * 240);

    process.stdout.write(`  ${permLabel} ... `);

    const worktreeResult = await Bun.$`git -C ${repoRoot} worktree add -b ${perm.branchName} ${perm.worktreePath} ${perm.commitHash}`.quiet().nothrow();
    if (worktreeResult.exitCode !== 0) {
      console.log('✗ (worktree failed)');
      console.error(`    ${worktreeResult.stderr.toString().trim()}\n`);
      continue;
    }

    const commitMessage = `${runAt} ${perm.prompt}`;
    await Bun.$`git -C ${perm.worktreePath} commit --allow-empty -m ${commitMessage}`.quiet();

    const measurementResults = task.measurements.map((m: Measurement) => ({
      measurement: m,
      result: 'PASS' as const,
    }));

    const resultJson = {
      experimentId: perm.experimentId,
      runId,
      runAt,
      durationSeconds,
      taskId: experiment.taskId,
      branch: perm.branchName,
      variables: {
        commitHash: perm.commitHash,
        model: perm.model,
        harness: perm.harness,
        prompt: perm.prompt,
      },
      measurements: measurementResults,
    };

    await Bun.write(path.join(runDir, `${permLabel}.json`), JSON.stringify(resultJson, null, 2));

    console.log(`✓  (${durationSeconds}s)`);
  }

  console.log();
}
