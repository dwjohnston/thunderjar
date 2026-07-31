import path from 'node:path';
import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import type { ThunderjarConfig, Experiment, NestedExperimentVariables, TaskMeasurement } from './types.ts';
import { evaluateMeasurement, normalizeTaskMeasurements } from './measurements.ts';
import { run, runShell } from './shell.ts';

interface RunPermutation {
  experimentId: string;
  model: string;
  harness: string;
  prompt: string;
  commitHash: string;
  worktreePath: string;
  branchName: string;
}

function isNestedExperimentVariables(
  variables: Experiment['variables'],
): variables is NestedExperimentVariables {
  return 'promptSets' in variables;
}

function generatePermutations(experimentId: string, experiment: Experiment, timestamp: string): RunPermutation[] {
  const permutations: RunPermutation[] = [];

  if (isNestedExperimentVariables(experiment.variables)) {
    for (const [harness, models] of Object.entries(experiment.variables.harnesses)) {
      for (const model of models) {
        for (const prompt of experiment.variables.promptSets) {
          const runId = `${experimentId}--${prompt}--${model}--${harness}`;
          const worktreePath = path.join(os.tmpdir(), 'thunderjar', `${runId}--${timestamp}`);
          const branchName = `thunderjar/${runId}--${timestamp}`;
          permutations.push({
            experimentId,
            model,
            harness,
            prompt,
            commitHash: experiment.commitHash,
            worktreePath,
            branchName,
          });
        }
      }
    }
    return permutations;
  }

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
  const result = await run(['git', '-C', cwd, 'rev-parse', '--show-toplevel']);
  return result.stdout.trim();
}

async function commitUnstagedChanges(worktreePath: string, extraFlags?: string) {
  const status = (await run(['git', '-C', worktreePath, 'status', '--porcelain'])).stdout.trim();
  if (status.length > 0) {
    await run(['git', '-C', worktreePath, 'add', '-A']);
    const msg = 'Thunderjar committed these changes before cleaning up the worktree';
    const flagsArr = extraFlags ? extraFlags.trim().split(/\s+/) : [];
    await run(['git', '-C', worktreePath, 'commit', ...flagsArr, '-m', msg]);
  }
}

export async function runExperiment(config: ThunderjarConfig, experimentId: string, cwd: string) {
  const experiment = config.experiments[experimentId];
  if (!experiment) throw new Error(`Experiment '${experimentId}' not found`);

  const task = config.tasks[experiment.taskId];
  if (!task) throw new Error(`Task '${experiment.taskId}' not found`);

  const repoRoot = await gitRoot(cwd);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const permutations = generatePermutations(experimentId, experiment, timestamp);
  const runDir = path.join(cwd, 'bench', 'results', `${experimentId}--${timestamp}`);

  await mkdir(runDir, { recursive: true });

  type PermState = 'running' | 'complete' | 'failed';
  const states: PermState[] = permutations.map(() => 'running');
  const starts = permutations.map(() => Date.now());
  const ends: (number | undefined)[] = permutations.map(() => undefined);
  const maxLabelLen = Math.max(...permutations.map(p => `${p.prompt} / ${p.model} / ${p.harness}`.length));

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const renderLine = (i: number) => {
    const perm = permutations[i];
    const state = states[i];
    if (!perm || !state) return '';
    const label = `${perm.prompt} / ${perm.model} / ${perm.harness}`.padEnd(maxLabelLen);
    const start = starts[i] ?? Date.now();
    const elapsed = formatElapsed((ends[i] ?? Date.now()) - start);
    const icon = state === 'running' ? '●' : state === 'complete' ? '✓' : '✗';
    const suffix = state !== 'running' ? `  ${state}` : '';
    return `  ${icon} ${label}    ${elapsed}${suffix}`;
  };

  console.log(`\nRunning '${experimentId}' — ${permutations.length} permutation(s)\n`);
  for (let i = 0; i < permutations.length; i++) process.stdout.write(renderLine(i) + '\n');

  const redraw = () => {
    process.stdout.write(`\x1B[${permutations.length}A`);
    for (let i = 0; i < permutations.length; i++) process.stdout.write(`\x1B[2K${renderLine(i)}\n`);
  };

  const timer = setInterval(redraw, 1000);

  await Promise.all(permutations.map(async (perm, i) => {
    await mkdir(path.dirname(perm.worktreePath), { recursive: true });
    const worktreeResult = await run(['git', '-C', repoRoot, 'worktree', 'add', '-b', perm.branchName, perm.worktreePath, perm.commitHash], { nothrow: true });
    if (worktreeResult.exitCode !== 0) {
      ends[i] = Date.now();
      states[i] = 'failed';
      return;
    }

    try {
      if (config.commands.onWorktreeCreate) {
        await runShell(config.commands.onWorktreeCreate, { cwd: perm.worktreePath, nothrow: true });
      }

      if (config.commands.setup) {
        await runShell(config.commands.setup, { cwd: perm.worktreePath, nothrow: true });
      }

      const promptConfig = config.prompts[perm.prompt];
      if (promptConfig) {
        await runShell(promptConfig.apply, { cwd: perm.worktreePath, nothrow: true });
      }

      const harnessTemplate = config.commands.harnesses[perm.harness];
      if (!harnessTemplate) {
        ends[i] = Date.now();
        states[i] = 'failed';
        return;
      }

      const harnessCmd = harnessTemplate
        .replace('{model}', perm.model)
        .replace('{worktreePath}', perm.worktreePath);
      const harnessWorkingDir = config.commands.harnessWorkingDirectory
        ? path.join(perm.worktreePath, config.commands.harnessWorkingDirectory)
        : perm.worktreePath;
      const harnessResult = await runShell(harnessCmd, {
        cwd: harnessWorkingDir,
        env: { ...process.env, THUNDERJAR_PROMPT: task.prompt },
        nothrow: true,
      });

      ends[i] = Date.now();
      states[i] = harnessResult.exitCode === 0 ? 'complete' : 'failed';

      const measurementCtx = {
        worktreePath: perm.worktreePath,
        exitCode: harnessResult.exitCode,
        stdout: harnessResult.stdout,
        stderr: harnessResult.stderr,
      };
      const normalized = normalizeTaskMeasurements(task.measurements as TaskMeasurement[]);
      const measurementResults = [];
      for (const m of normalized) {
        const result = await evaluateMeasurement({
          measurement: m.measurement,
          measurers: config.measurers,
          ctx: measurementCtx,
        });
        measurementResults.push({
          measurementId: m.measurementId,
          measurement: m.measurement,
          result,
        });
      }

      const permLabel = `${perm.prompt}--${perm.model}--${perm.harness}`;
      const runAt = new Date().toISOString();
      const durationSeconds = Math.floor(((ends[i] ?? Date.now()) - (starts[i] ?? Date.now())) / 1000);

      await writeFile(path.join(runDir, `${permLabel}.json`), JSON.stringify({
        experimentId: perm.experimentId,
        runId: `${perm.experimentId}--${permLabel}`,
        runAt,
        durationSeconds,
        taskId: experiment.taskId,
        branch: perm.branchName,
        variables: { commitHash: perm.commitHash, model: perm.model, harness: perm.harness, prompt: perm.prompt },
        output: {
          stdout: harnessResult.stdout,
          stderr: harnessResult.stderr,
          exitCode: harnessResult.exitCode,
        },
        measurements: measurementResults,
      }, null, 2));
    } finally {
      await commitUnstagedChanges(perm.worktreePath, config.commands.worktreeCleanupCommitFlags);
      await run(['git', '-C', repoRoot, 'worktree', 'remove', '--force', perm.worktreePath], { nothrow: true });
    }
  }));

  clearInterval(timer);
  redraw();
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

  await mkdir(runDir, { recursive: true });

  console.log(`\nFake-running ${permutations.length} permutation(s) for '${experimentId}':\n`);

  for (const perm of permutations) {
    const permLabel = `${perm.prompt}--${perm.model}--${perm.harness}`;
    const runId = `${perm.experimentId}--${permLabel}`;
    const runAt = new Date(now.getTime() + Math.random() * 1000).toISOString();
    const durationSeconds = Math.floor(60 + Math.random() * 240);

    process.stdout.write(`  ${permLabel} ... `);

    const worktreeResult = await run(['git', '-C', repoRoot, 'worktree', 'add', '-b', perm.branchName, perm.worktreePath, perm.commitHash], { nothrow: true });
    if (worktreeResult.exitCode !== 0) {
      console.log('✗ (worktree failed)');
      console.error(`    ${worktreeResult.stderr.trim()}\n`);
      continue;
    }

    if (config.commands.onWorktreeCreate) {
      await runShell(config.commands.onWorktreeCreate, { cwd: perm.worktreePath, nothrow: true });
    }

    const commitMessage = `${runAt} ${perm.prompt}`;
    await run(['git', '-C', perm.worktreePath, 'commit', '--allow-empty', '-m', commitMessage]);

    const normalized = normalizeTaskMeasurements(task.measurements as TaskMeasurement[]);
    const measurementResults = normalized.map((m) => ({
      measurementId: m.measurementId,
      measurement: m.measurement,
      result: { outcome: 'measured', data: { ok: true } },
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

    await writeFile(path.join(runDir, `${permLabel}.json`), JSON.stringify(resultJson, null, 2));
    await commitUnstagedChanges(perm.worktreePath);
    await run(['git', '-C', repoRoot, 'worktree', 'remove', perm.worktreePath]);

    console.log(`✓  (${durationSeconds}s)`);
  }

  console.log();
}
