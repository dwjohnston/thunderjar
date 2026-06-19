import { loadConfig } from '../../config.ts';
import { runExperiment } from '../../runner/index.ts';
import { renderRun } from '../../report/terminal.ts';
import { renderCompare } from '../../report/compare.ts';
import { saveResult } from '../../report/store.ts';
import type { ExperimentResult } from '../../types.ts';

export async function run(args: string[]): Promise<void> {
  const config = await loadConfig();

  const taskFlag = args.indexOf('--task');
  let experimentIds: string[];

  if (taskFlag !== -1) {
    const taskId = args[taskFlag + 1];
    if (!taskId) {
      console.error('--task requires a task id');
      process.exit(1);
    }
    experimentIds = Object.entries(config.experiments)
      .filter(([, exp]) => exp.task === taskId)
      .map(([id]) => id);
  } else {
    experimentIds = args;
  }

  if (experimentIds.length === 0) {
    console.error('Specify at least one experiment id, or use --task <taskId>');
    process.exit(1);
  }

  const results: ExperimentResult[] = [];

  for (const id of experimentIds) {
    const experiment = config.experiments[id];
    if (!experiment) {
      console.error(`Unknown experiment: ${id}`);
      process.exit(1);
    }
    const task = config.tasks[experiment.task];
    if (!task) {
      console.error(`Unknown task: ${experiment.task}`);
      process.exit(1);
    }

    const result = await runExperiment(id, experiment, task, config.commands);
    renderRun(result);
    await saveResult(result);
    results.push(result);
  }

  if (results.length > 1) {
    renderCompare(results);
  }
}
