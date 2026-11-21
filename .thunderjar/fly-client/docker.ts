// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `docker <args…>`: the runtime command Thunderjar runs every `docker` through. Forwards it to the
// machine's daemon, with its stdin, output and exit code passed through.

import { connected, dockerCommand, dockerEnv, ensureConnection } from "./connection.ts";
import { findMachine, type Machine } from "./fly.ts";
import { markInFlight } from "./idle.ts";
import type { Settings } from "./settings.ts";
import { readTimer, resetTimer, writeTimer } from "./timer.ts";
import { up } from "./up.ts";
import { ensureWatcher } from "./watch.ts";

const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;

/** The machine's ID, once it's started. */
async function startedMachineId(settings: Settings): Promise<string> {
  let machine: Machine | undefined;
  try {
    machine = await findMachine(settings);
  } catch (error) {
    // Many commands start at once at the beginning of a run, and Fly's API can turn some away. With
    // the connection open the machine is started, so carry on.
    const timer = await readTimer(settings);
    if (timer?.app === settings.app && (await connected(settings))) return timer.machineId;
    throw error;
  }
  if (!machine || machine.state !== "started") machine = await up(settings);
  return machine.id;
}

export async function docker(args: string[], settings: Settings): Promise<number> {
  const machineId = await startedMachineId(settings);
  await ensureConnection(settings, machineId);
  const done = await markInFlight(settings);
  const proc = Bun.spawn(dockerCommand(args), {
    env: dockerEnv(settings),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  // Interrupted, it passes the signal on, and still resets the timer once docker exits.
  let received: keyof typeof SIGNALS | undefined;
  for (const signal of Object.keys(SIGNALS) as (keyof typeof SIGNALS)[]) {
    process.on(signal, () => {
      received = signal;
      proc.kill(signal);
    });
  }
  const exitCode = await proc.exited;
  await done();
  const previous = await readTimer(settings);
  await writeTimer(settings, { ...resetTimer(settings, machineId), watcherPid: ensureWatcher(settings, previous) });
  return received ? 128 + SIGNALS[received] : exitCode;
}
