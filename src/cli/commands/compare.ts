import { loadConfig } from '../../config.ts';
import { loadResults, loadResultsForExperiment } from '../../report/store.ts';
import { renderCompare } from '../../report/compare.ts';
import type { ExperimentResult } from '../../types.ts';

export async function compare(args: string[]): Promise<void> {
  const experimentFlag = args.indexOf('--experiment');

  if (experimentFlag !== -1) {
    const experimentId = args[experimentFlag + 1];
    if (!experimentId) {
      console.error('--experiment requires an experiment id');
      process.exit(1);
    }
    const results = await loadResultsForExperiment(experimentId);
    if (results.length < 2) {
      console.error(`Need at least 2 stored runs for experiment '${experimentId}'. Run it first.`);
      process.exit(1);
    }
    renderCompare(results);
    return;
  }

  const taskFlag = args.indexOf('--task');
  let runIds: string[];

  if (taskFlag !== -1) {
    const taskId = args[taskFlag + 1];
    if (!taskId) {
      console.error('--task requires a task id');
      process.exit(1);
    }
    const config = await loadConfig();
    const experimentIds = Object.entries(config.experiments)
      .filter(([, exp]) => exp.taskId === taskId)
      .map(([id]) => id);
    const allResults = await loadResults();
    const byRunId = new Map<string, ExperimentResult>();
    for (const r of allResults.filter(r => experimentIds.includes(r.experimentId))) {
      byRunId.set(r.runId, r);
    }
    const results = [...byRunId.values()];
    if (results.length < 2) {
      console.error(`Need at least 2 stored runs for task '${taskId}'.`);
      process.exit(1);
    }
    renderCompare(results);
    return;
  }

  runIds = args;

  if (runIds.length < 2) {
    console.error('compare requires at least 2 run ids, or use --experiment <id> or --task <id>');
    process.exit(1);
  }

  const allResults = await loadResults();
  const results: ExperimentResult[] = [];

  for (const id of runIds) {
    const latest = allResults
      .filter(r => r.runId === id)
      .sort((a, b) => b.runAt.localeCompare(a.runAt))[0];
    if (!latest) {
      console.error(`No stored result for run: ${id}`);
      process.exit(1);
    }
    results.push(latest);
  }

  renderCompare(results);
}
