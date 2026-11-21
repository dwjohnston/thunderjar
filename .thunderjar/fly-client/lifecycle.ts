// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// Stopping and destroying the machine, for `stop`, `destroy` and `watch`.

import { closeConnection } from "./connection.ts";
import { fly, type Machine } from "./fly.ts";
import type { Settings } from "./settings.ts";

export async function stopMachine(settings: Settings, machine: Machine): Promise<void> {
  await closeConnection(settings);
  await fly(["machine", "stop", machine.id, "-a", settings.app]);
}

/** Destroys the machine and its volumes. */
export async function destroyMachine(settings: Settings, machine: Machine): Promise<void> {
  await closeConnection(settings);
  await fly(["machine", "destroy", machine.id, "-a", settings.app, "--force"]);
  for (const mount of machine.config.mounts ?? []) {
    await fly(["volumes", "destroy", mount.volume, "-a", settings.app, "--yes"]);
  }
}
