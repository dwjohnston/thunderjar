import path from 'path';
import type { Commands, Experiment, ExperimentResult, Measurement, MeasurementOutcome, Prompt, RunVariables, Task } from '../types.ts';
import { createWorktree, getAddedLines, getChangedFiles, removeWorktree } from './worktree.ts';
import { runHarness } from './harness.ts';
import { measureCommand } from './measurements/command.ts';
import { measureFileCreated } from './measurements/fileCreated.ts';
import { measureFileExists } from './measurements/fileExists.ts';
import { measureGrep } from './measurements/grep.ts';
import { measureCorrectnessTest } from './measurements/correctnessTest.ts';
import { $ } from 'bun';

export function makeRunId(experimentId: string, variables: RunVariables): string {
  return `${experimentId}--${variables.prompt}--${variables.model}--${variables.harness}`;
}

export function permutations(experimentId: string, experiment: Experiment): RunVariables[] {
  const result: RunVariables[] = [];
  for (const model of experiment.variables.models) {
    for (const harness of experiment.variables.harnesses) {
      for (const prompt of experiment.variables.prompts) {
        result.push({ commitHash: experiment.commitHash, model, harness, prompt });
      }
    }
  }
  return result;
}

export async function runExperiment(
  experimentId: string,
  experiment: Experiment,
  task: Task,
  prompt: Prompt,
  variables: RunVariables,
  commands: Commands,
): Promise<ExperimentResult> {
  const runId = makeRunId(experimentId, variables);
  const startedAt = Date.now();
  const worktree = await createWorktree(runId, experiment.commitHash);

  try {
    await $`sh -c ${prompt.apply}`.cwd(worktree);

    if (commands.setup) {
      await $`sh -c ${commands.setup}`.cwd(worktree);
    }

    if (commands.beforeRun) {
      const cmd = commands.beforeRun.replace('{prompt}', variables.prompt);
      await $`sh -c ${cmd}`.cwd(worktree);
    }

    await runHarness(variables.harness, task.prompt, variables.model, worktree, commands);

    const changedFiles = await getChangedFiles(worktree);
    const addedLines = await getAddedLines(worktree);
    const configDir = path.resolve(process.cwd(), 'bench');

    const outcomes: MeasurementOutcome[] = [];
    let shortCircuited = false;

    for (const m of task.measurements) {
      if (shortCircuited) {
        outcomes.push({ measurement: m, result: 'SKIPPED' });
        continue;
      }

      const outcome = await evaluate(m, worktree, changedFiles, addedLines, commands.testRunner, configDir);
      outcomes.push(outcome);

      if (outcome.result === 'FAIL') shortCircuited = true;
    }

    return {
      experimentId,
      runId,
      runAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      taskId: experiment.taskId,
      variables,
      measurements: outcomes,
    };
  } finally {
    await removeWorktree(runId);
  }
}

async function evaluate(
  m: Measurement,
  worktree: string,
  changedFiles: string[],
  addedLines: string,
  testRunner: string,
  configDir: string,
): Promise<MeasurementOutcome> {
  switch (m.type) {
    case 'command':
      return measureCommand(m.run, m.expectExitCode, worktree);
    case 'fileCreated':
      return measureFileCreated(
        'path' in m ? { path: m.path } : { glob: m.glob },
        changedFiles,
      );
    case 'fileExists':
      return measureFileExists(m.path, worktree);
    case 'grep':
      return measureGrep(m, worktree, changedFiles, addedLines);
    case 'correctness-test':
      return measureCorrectnessTest(m.templatePath, testRunner, worktree, configDir);
  }
}
