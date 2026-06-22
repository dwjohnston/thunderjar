#!/usr/bin/env bun
import { run } from './commands/run.ts';
import { compare } from './commands/compare.ts';
import { list } from './commands/list.ts';
import { clean } from './commands/clean.ts';

const [, , command, ...args] = process.argv;

const commands: Record<string, (args: string[]) => Promise<void>> = {
  run,
  compare,
  list,
  clean,
};

if (!command || !(command in commands)) {
  console.error(`Usage: thunderjar <command> [args]`);
  console.error(`Commands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

await commands[command]!(args);
