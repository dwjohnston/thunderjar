#!/usr/bin/env bun

import { select } from '@inquirer/prompts';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { ThunderjarConfig } from '../types.ts';
import { runExperiment, fakeRunExperiment } from '../runner.ts';
import { buildInitConfigSource, computeRelativeImportPath } from './initTemplate.ts';

async function loadConfig(configPath: string): Promise<ThunderjarConfig> {
  const mod = await import(configPath);
  return mod.default as ThunderjarConfig;
}

async function runInit(cwd: string) {
  const configPath = path.join(cwd, 'thunderjar.config.ts');

  if (await Bun.file(configPath).exists()) {
    console.error(`A config already exists at: ${configPath}`);
    process.exit(1);
  }

  const thunderjarRoot = path.resolve(import.meta.dir, '..', '..');
  const importPath = computeRelativeImportPath(cwd, path.join(thunderjarRoot, 'src', 'ThunderJarConfig.ts'));

  await Bun.write(configPath, buildInitConfigSource(importPath));
  console.log(`Wrote ${configPath}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { config: { type: 'string', short: 'c' } },
    strict: false,
    allowPositionals: true,
  });

  if (positionals[0] === 'init') {
    await runInit(process.cwd());
    return;
  }

  const configPath = typeof values.config === 'string'
    ? path.resolve(process.cwd(), values.config)
    : path.resolve(process.cwd(), 'thunderjar.config.ts');

  const projectRoot = path.dirname(configPath);

  let config: ThunderjarConfig;
  try {
    config = await loadConfig(configPath);
  } catch {
    console.error(`No config found at: ${configPath}`);
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
      name: `${id} — ${config.experiments[id]?.description ?? ''}`,
      value: id,
    })),
  });

  if (action === 'run') {
    const mode = await select({
      message: 'Run mode:',
      choices: [
        { name: 'Fake — generate placeholder PASS results', value: 'fake' },
        { name: 'Real', value: 'real' },
      ],
    });

    if (mode === 'fake') {
      await fakeRunExperiment(config, experimentId, projectRoot);
    } else {
      await runExperiment(config, experimentId, projectRoot);
    }
  } else {
    const resultsDir = path.join(projectRoot, 'bench', 'results');
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

    const permFile = await select({
      message: 'Select permutation:',
      choices: permFiles.map(f => ({ name: f.replace(/\.json$/, ''), value: f })),
    });

    const resultJson = JSON.parse(await Bun.file(path.join(runDir, permFile)).text());
    const branch: string | undefined = resultJson.branch;

    if (!branch) {
      console.log('\nNo branch recorded for this run.');
      return;
    }

    const action2 = await select({
      message: `Branch: ${branch}`,
      choices: [
        { name: 'Checkout', value: 'checkout' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action2 === 'checkout') {
      const repoRoot = (await Bun.$`git -C ${projectRoot} rev-parse --show-toplevel`.quiet()).stdout.toString().trim();

      const status = (await Bun.$`git -C ${repoRoot} status --porcelain`.quiet()).stdout.toString().trim();
      if (status.length > 0) {
        console.error('\nCannot checkout: working tree has uncommitted or untracked changes.');
        return;
      }

      const result = await Bun.$`git -C ${repoRoot} checkout ${branch}`.nothrow();
      if (result.exitCode !== 0) {
        console.error(`\nFailed to checkout branch: ${result.stderr.toString().trim()}`);
      }
    }
  }
}

main();
