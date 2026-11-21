// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// Whether the machine is idle, i.e. safe to stop, destroy or resize: nothing would be killed.

import { dockerOutput, ensureConnection } from "./connection.ts";
import type { Machine } from "./fly.ts";
import type { Settings } from "./settings.ts";

/** Why the machine is busy, or undefined if it's idle. A machine that isn't started is idle. */
export async function busy(settings: Settings, machine: Machine): Promise<string | undefined> {
  if (machine.state !== "started") return undefined;
  await ensureConnection(settings, machine.id);
  const ps = await dockerOutput(settings, ["ps", "--quiet"]);
  if (ps.exitCode !== 0) return "its Docker daemon didn't answer";
  const running = ps.stdout.split("\n").filter(Boolean).length;
  if (running > 0) return `${running} container${running === 1 ? " is" : "s are"} running`;
  return undefined;
}
