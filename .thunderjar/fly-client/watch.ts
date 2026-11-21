// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `watch`: the detached process that acts on the timer. `docker` starts it, if the one the timer
// records isn't running. It reads the timer every 10 polls, so a command that resets the timer
// moves its deadlines too. It exits when the timer goes, or when another watcher takes it over.

import { findMachine } from "./fly.ts";
import { destroyMachine, stopMachine } from "./lifecycle.ts";
import { alive } from "./lock.ts";
import type { Settings } from "./settings.ts";
import { deleteTimer, readTimer, type Timer } from "./timer.ts";

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);

/** Starts `watch`, detached, unless the timer's watcher is running. Returns the watcher's PID. */
export function ensureWatcher(settings: Settings, timer: Timer | undefined): number {
  if (timer?.watcherPid && alive(timer.watcherPid)) return timer.watcherPid;
  const logFile = Bun.file(`${settings.runtimeDir}/watch.log`);
  const proc = Bun.spawn([process.execPath, `${import.meta.dir}/index.ts`, "watch"], {
    env: Bun.env,
    // Its own session, so Ctrl-C on the command that started it doesn't reach it.
    detached: true,
    stdin: "ignore",
    stdout: logFile,
    stderr: logFile,
  });
  proc.unref();
  return proc.pid;
}

export async function watch(_args: string[], settings: Settings): Promise<number> {
  // The command that started it records its PID in the timer, so it doesn't write the timer itself.
  log(`watching ${settings.timerFile}`);
  for (;;) {
    await Bun.sleep(settings.pollMs * 10);
    const timer = await readTimer(settings);
    if (!(await Bun.file(settings.timerFile).exists())) {
      log("the timer's gone");
      return 0;
    }
    if (timer?.watcherPid && timer.watcherPid !== process.pid && alive(timer.watcherPid)) {
      log(`watcher ${timer.watcherPid} has taken over`);
      return 0;
    }
    if (!timer) continue;
    try {
      if (await act(settings, timer)) return 0;
    } catch (error) {
      // e.g. `fly` couldn't reach its API: try again next time round.
      log(error instanceof Error ? error.message : String(error));
    }
  }
}

/** Stops or destroys the machine if its deadline has passed. Returns true once the timer's done. */
async function act(settings: Settings, timer: Timer): Promise<boolean> {
  const now = Date.now();
  if (now >= Date.parse(timer.destroyAt)) {
    const machine = await findMachine(settings);
    if (machine) {
      log(`destroying ${machine.id} and its volumes: no docker command since ${timer.lastCommandFinishedAt}`);
      await destroyMachine(settings, machine);
    }
    await deleteTimer(settings);
    return true;
  }
  if (now >= Date.parse(timer.stopAt)) {
    const machine = await findMachine(settings);
    if (machine?.state === "started") {
      log(`stopping ${machine.id}: no docker command since ${timer.lastCommandFinishedAt}`);
      await stopMachine(settings, machine);
    }
  }
  return false;
}
