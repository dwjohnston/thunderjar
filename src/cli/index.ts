#!/usr/bin/env bun

import { select } from '@inquirer/prompts';
import path from 'node:path';
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
    console.log(`\n${experimentId}: not yet implemented`);
  }
}

main();
