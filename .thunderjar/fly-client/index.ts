#!/usr/bin/env bun
// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// The client for the Fly machine remote runs use: it creates the machine, starts it, and stops it
// when idle. See ../AGENTS.md.
//
//   bun .thunderjar/fly-client/index.ts <command>
//
//   up                    create the machine if missing, start it if stopped, resize it if idle
//   docker <args…>        run docker against the machine's daemon, starting it first if needed
//   stop [--force]        stop the machine, if idle
//   destroy [--force]     destroy the machine and its volumes, if idle
//   status [--json]       its state and size, and the timer
//   prune                 remove its stopped containers and unused images
//   watch                 the detached process that acts on the timer: `docker` starts it

import { destroyCommand, statusCommand, stopCommand } from "./commands.ts";
import { docker } from "./docker.ts";
import { readSettings, type Settings } from "./settings.ts";
import { upCommand } from "./up.ts";
import { watch } from "./watch.ts";

const USAGE = "usage: index.ts <up | docker <args…> | stop [--force] | destroy [--force] | status [--json] | prune | watch>";

const notImplemented = (command: string) => async (_args: string[], _settings: Settings): Promise<number> => {
  throw new Error(`${command} is not implemented`);
};

const commands: Record<string, (args: string[], settings: Settings) => Promise<number>> = {
  up: upCommand,
  docker,
  stop: stopCommand,
  destroy: destroyCommand,
  status: statusCommand,
  prune: notImplemented("prune"),
  watch,
};

const [name, ...args] = Bun.argv.slice(2);
const command = name === undefined ? undefined : commands[name];
if (!command) {
  console.error(USAGE);
  process.exit(2);
}
try {
  process.exit(await command(args, readSettings()));
} catch (error) {
  console.error(`fly-client: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
