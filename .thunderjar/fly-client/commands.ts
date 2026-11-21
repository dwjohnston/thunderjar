// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `stop`, `destroy`, `status` and `prune`.

import { findMachine } from "./fly.ts";
import { busy } from "./idle.ts";
import { stopMachine } from "./lifecycle.ts";
import type { Settings } from "./settings.ts";

/** The flags a command was given, out of those it takes. */
function flags(args: string[], allowed: string[]): Set<string> {
  for (const arg of args) {
    if (!allowed.includes(arg)) throw new Error(`unexpected argument '${arg}'`);
  }
  return new Set(args);
}

export async function stopCommand(args: string[], settings: Settings): Promise<number> {
  const force = flags(args, ["--force"]).has("--force");
  const machine = await findMachine(settings);
  if (!machine) {
    console.log(`Fly app ${settings.app} has no machine`);
    return 0;
  }
  if (machine.state === "stopped") {
    console.log(`${machine.id} is already stopped`);
    return 0;
  }
  const reason = force ? undefined : await busy(settings, machine);
  if (reason) {
    console.error(`fly-client: not stopping ${machine.id}: ${reason}. --force stops it anyway`);
    return 1;
  }
  await stopMachine(settings, machine);
  console.log(`${machine.id} stopped`);
  return 0;
}
