import path from 'path';
import type { Commands, Experiment, ExperimentResult, Measurement, MeasurementOutcome, Task } from '../types.ts';
import { createWorktree, getAddedLines, getChangedFiles, overlayPromptFiles, removeWorktree, resolveRef } from './worktree.ts';
import { runHarness } from './harness.ts';
import { measureCommand } from './measurements/command.ts';
import { measureFileCreated } from './measurements/fileCreated.ts';
import { measureFileExists } from './measurements/fileExists.ts';
import { measureGrep } from './measurements/grep.ts';
import { measureCorrectnessTest } from './measurements/correctnessTest.ts';
import { $ } from 'bun';

export async function runExperiment(
  experimentId: string,
  experiment: Experiment,
  task: Task,
  commands: Commands,
): Promise<ExperimentResult> {
  const startedAt = Date.now();
  const resolvedPromptsCommit = await resolveRef(experiment.promptsCommit);
  const worktree = await createWorktree(experimentId, experiment.commitHash);

  try {
    await overlayPromptFiles(worktree, resolvedPromptsCommit, commands.promptFiles);

    if (commands.setup) {
      await $`sh -c ${commands.setup}`.cwd(worktree);
    }

    if (commands.beforeRun) {
      const cmd = commands.beforeRun.replace('{approachName}', experiment.approachName);
      await $`sh -c ${cmd}`.cwd(worktree);
    }

    await runHarness(experiment.harnessName, task.prompt, experiment.modelName, worktree, commands);

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

    const passed = outcomes.every(o => o.result === 'PASS');

    return {
      experimentId,
      runAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      task: experiment.task,
      variables: {
        commitHash: experiment.commitHash,
        promptsCommit: resolvedPromptsCommit,
        approachName: experiment.approachName,
        modelName: experiment.modelName,
        harnessName: experiment.harnessName,
      },
      result: passed ? 'PASS' : 'FAIL',
      measurements: outcomes,
    };
  } finally {
    await removeWorktree(experimentId);
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
