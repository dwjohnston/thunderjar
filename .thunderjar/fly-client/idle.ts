// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// Whether the machine is idle, i.e. safe to stop, destroy or resize: nothing would be killed.

import { dockerOutput, ensureConnection } from "./connection.ts";
import type { Machine } from "./fly.ts";
import { alive } from "./lock.ts";
import type { Settings } from "./settings.ts";

// Each `docker` command in flight has a file here, named by its PID. A build runs no container
// that `docker ps` lists, so without these a long one would look idle.
const commandsDir = (settings: Settings) => `${settings.runtimeDir}/commands`;

/** Marks this process's docker command as in flight, until the returned function is called. */
export async function markInFlight(settings: Settings): Promise<() => Promise<void>> {
  const marker = Bun.file(`${commandsDir(settings)}/${process.pid}`);
  await Bun.write(marker, String(process.pid));
  return async () => {
    if (await marker.exists()) await marker.delete();
  };
}

/** How many other client processes have a docker command in flight. */
export async function commandsInFlight(settings: Settings): Promise<number> {
  let count = 0;
  for await (const name of new Bun.Glob("*").scan({ cwd: commandsDir(settings), onlyFiles: true })) {
    const pid = Number(name);
    if (pid === process.pid) continue;
    if (alive(pid)) count++;
    else await Bun.file(`${commandsDir(settings)}/${name}`).delete().catch(() => {});
  }
  return count;
}

/** Why the machine is busy, or undefined if it's idle. A machine that isn't started is idle. */
export async function busy(settings: Settings, machine: Machine): Promise<string | undefined> {
  if (machine.state !== "started") return undefined;
  const commands = await commandsInFlight(settings).catch(() => 0);
  if (commands > 0) return `${commands} docker command${commands === 1 ? " is" : "s are"} running`;
  await ensureConnection(settings, machine.id);
  const ps = await dockerOutput(settings, ["ps", "--quiet"]);
  if (ps.exitCode !== 0) return "its Docker daemon didn't answer";
  const running = ps.stdout.split("\n").filter(Boolean).length;
  if (running > 0) return `${running} container${running === 1 ? " is" : "s are"} running`;
  return undefined;
}
