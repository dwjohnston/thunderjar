import { loadConfig } from '../../config.ts';
import { loadResults } from '../../report/store.ts';

export async function list(args: string[]): Promise<void> {
  const [subcommand] = args;

  if (!subcommand || subcommand === 'experiments') {
    const config = await loadConfig();
    console.log('\nTasks:');
    for (const [id, task] of Object.entries(config.tasks)) {
      console.log(`  ${id} — ${task.description}`);
    }
    console.log('\nPrompts:');
    for (const [id, prompt] of Object.entries(config.prompts)) {
      console.log(`  ${id} — ${prompt.apply}`);
    }
    console.log('\nExperiments:');
    for (const [id, exp] of Object.entries(config.experiments)) {
      const { models, harnesses, prompts } = exp.variables;
      console.log(`  ${id} — ${exp.description} (task: ${exp.taskId}, models: ${models.join(',')}, harnesses: ${harnesses.join(',')}, prompts: ${prompts.join(',')})`);
    }
    console.log();
    return;
  }

  if (subcommand === 'results') {
    const results = await loadResults();
    if (results.length === 0) {
      console.log('\nNo stored results.\n');
      return;
    }
    console.log('\nStored results:');
    for (const r of results) {
      const passed = r.measurements.filter(m => m.result === 'PASS').length;
      console.log(`  ${r.runId} — ${passed}/${r.measurements.length} — ${r.runAt}`);
    }
    console.log();
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}. Use 'experiments' or 'results'.`);
  process.exit(1);
}
