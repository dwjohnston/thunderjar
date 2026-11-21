// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `stop`, `destroy`, `status` and `prune`.

import { describeSize, findMachine } from "./fly.ts";
import { busy } from "./idle.ts";
import { destroyMachine, stopMachine } from "./lifecycle.ts";
import { alive } from "./lock.ts";
import type { Settings } from "./settings.ts";
import { deleteTimer, readTimer } from "./timer.ts";

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

export async function destroyCommand(args: string[], settings: Settings): Promise<number> {
  const force = flags(args, ["--force"]).has("--force");
  const machine = await findMachine(settings);
  if (!machine) {
    console.log(`Fly app ${settings.app} has no machine`);
    await deleteTimer(settings);
    return 0;
  }
  const reason = force ? undefined : await busy(settings, machine);
  if (reason) {
    console.error(`fly-client: not destroying ${machine.id}: ${reason}. --force destroys it anyway`);
    return 1;
  }
  await destroyMachine(settings, machine);
  await deleteTimer(settings);
  console.log(`${machine.id} and its volumes destroyed`);
  return 0;
}

export async function statusCommand(args: string[], settings: Settings): Promise<number> {
  const json = flags(args, ["--json"]).has("--json");
  const machine = await findMachine(settings);
  const timer = await readTimer(settings);
  const status = {
    app: settings.app,
    machine: machine
      ? { id: machine.id, state: machine.state, region: machine.region, size: machine.config.guest }
      : null,
    timer: timer ? { ...timer, watcherRunning: alive(timer.watcherPid) } : null,
  };
  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return 0;
  }
  console.log(
    machine
      ? `${machine.id} in ${settings.app}: ${machine.state}, ${describeSize(machine.config.guest)}, ${machine.region}`
      : `Fly app ${settings.app} has no machine: the next docker command creates it`,
  );
  if (!timer) {
    console.log("No timer: nothing will be stopped or destroyed");
    return 0;
  }
  console.log(`Last docker command  ${timer.lastCommandFinishedAt}`);
  console.log(`Stops at             ${timer.stopAt}, if idle`);
  console.log(`Destroyed at         ${timer.destroyAt}, if idle`);
  console.log(`Watcher              ${status.timer?.watcherRunning ? `running, PID ${timer.watcherPid}` : "not running"}`);
  return 0;
}
