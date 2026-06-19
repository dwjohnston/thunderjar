import { loadConfig } from '../../config.ts';
import { loadResults } from '../../report/store.ts';
import { renderCompare } from '../../report/compare.ts';
import type { ExperimentResult } from '../../types.ts';

export async function compare(args: string[]): Promise<void> {
  const taskFlag = args.indexOf('--task');

  let experimentIds: string[];

  if (taskFlag !== -1) {
    const taskId = args[taskFlag + 1];
    if (!taskId) {
      console.error('--task requires a task id');
      process.exit(1);
    }
    const config = await loadConfig();
    experimentIds = Object.entries(config.experiments)
      .filter(([, exp]) => exp.task === taskId)
      .map(([id]) => id);
  } else {
    experimentIds = args;
  }

  if (experimentIds.length < 2) {
    console.error('compare requires at least 2 experiment ids');
    process.exit(1);
  }

  const allResults = await loadResults();
  const results: ExperimentResult[] = [];

  for (const id of experimentIds) {
    const latest = allResults
      .filter(r => r.experimentId === id)
      .sort((a, b) => b.runAt.localeCompare(a.runAt))[0];
    if (!latest) {
      console.error(`No stored result for experiment: ${id}`);
      process.exit(1);
    }
    results.push(latest);
  }

  renderCompare(results);
}
