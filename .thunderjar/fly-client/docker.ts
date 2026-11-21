// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `docker <args…>`: the runtime command Thunderjar runs every `docker` through. Forwards it to the
// machine's daemon, with its stdin, output and exit code passed through.

import { dockerCommand, dockerEnv, ensureConnection } from "./connection.ts";
import { findMachine } from "./fly.ts";
import { markInFlight } from "./idle.ts";
import type { Settings } from "./settings.ts";
import { readTimer, resetTimer, writeTimer } from "./timer.ts";
import { up } from "./up.ts";
import { ensureWatcher } from "./watch.ts";

const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;

export async function docker(args: string[], settings: Settings): Promise<number> {
  let machine = await findMachine(settings);
  if (!machine || machine.state !== "started") machine = await up(settings);
  await ensureConnection(settings, machine.id);
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
  await writeTimer(settings, { ...resetTimer(settings, machine.id), watcherPid: ensureWatcher(settings, previous) });
  return received ? 128 + SIGNALS[received] : exitCode;
}
