#!/usr/bin/env bun

import { select } from '@inquirer/prompts';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import type { ThunderjarConfig } from '../types.ts';
import { runExperiment, fakeRunExperiment } from '../runner.ts';

async function loadConfig(): Promise<ThunderjarConfig> {
  const configPath = path.resolve(process.cwd(), 'thunderjar.config.ts');
  const mod = await import(configPath);
  return mod.default as ThunderjarConfig;
}

async function main() {
  let config: ThunderjarConfig;
  try {
    config = await loadConfig();
  } catch {
    console.error('No thunderjar.config.ts found in current directory.');
    process.exit(1);
  }

  const experimentIds = Object.keys(config.experiments);

  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'Run experiment', value: 'run' },
      { name: 'List experiment results', value: 'list' },
    ],
  });

  const experimentId = await select({
    message: action === 'run' ? 'Select experiment to run:' : 'Select experiment:',
    choices: experimentIds.map(id => ({
      name: `${id} — ${config.experiments[id]!.description}`,
      value: id,
    })),
  });

  if (action === 'run') {
    const mode = await select({
      message: 'Run mode:',
      choices: [
        { name: 'Fake — generate placeholder PASS results', value: 'fake' },
        { name: 'Real — (not yet implemented)', value: 'real' },
      ],
    });

    if (mode === 'fake') {
      await fakeRunExperiment(config, experimentId, process.cwd());
    } else {
      await runExperiment(config, experimentId, process.cwd());
    }
  } else {
    const resultsDir = path.join(process.cwd(), 'bench', 'results');
    let entries: string[] = [];
    try {
      entries = await readdir(resultsDir);
    } catch {
      console.log('\nNo results directory found.');
      return;
    }

    const prefix = `${experimentId}--`;
    const runs = entries
      .filter(e => e.startsWith(prefix))
      .sort()
      .reverse();

    if (runs.length === 0) {
      console.log(`\nNo results found for '${experimentId}'.`);
      return;
    }

    const runFolder = await select({
      message: 'Select run:',
      choices: runs.map(folder => {
        // folder: <experimentId>--2026-06-22T10-00-00-000Z
        const raw = folder.slice(prefix.length);
        // raw: 2026-06-22T10-00-00-000Z → 2026-06-22 10:00
        const short = raw.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2}).*/, '$1 $2:$3');
        return { name: short, value: folder };
      }),
    });

    const runDir = path.join(resultsDir, runFolder);
    const permFiles = (await readdir(runDir))
      .filter(f => f.endsWith('.json'))
      .sort();

    const permutation = await select({
      message: 'Select permutation:',
      choices: permFiles.map(f => ({ name: f.replace(/\.json$/, ''), value: f })),
    });

    console.log(`\n${permutation}: not yet implemented`);
  }
}

main();
