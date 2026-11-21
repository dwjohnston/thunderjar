// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `docker <args…>`: the runtime command Thunderjar runs every `docker` through. Forwards it to the
// machine's daemon, with its stdin, output and exit code passed through.

import { dockerCommand, dockerEnv, ensureConnection } from "./connection.ts";
import { findMachine } from "./fly.ts";
import type { Settings } from "./settings.ts";

export async function docker(args: string[], settings: Settings): Promise<number> {
  const machine = await findMachine(settings);
  if (!machine || machine.state !== "started") {
    throw new Error(`the Fly machine in app ${settings.app} is ${machine?.state ?? "missing"}`);
  }
  await ensureConnection(settings, machine.id);
  const proc = Bun.spawn(dockerCommand(args), {
    env: dockerEnv(settings),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}
