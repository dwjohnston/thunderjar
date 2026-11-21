// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// The `fly` CLI, for the one machine in the app.

import { flyEnv, type Settings } from "./settings.ts";

export interface Guest {
  cpu_kind: string;
  cpus: number;
  memory_mb: number;
}

export interface MachineConfig {
  image?: string;
  guest?: Guest;
  env?: Record<string, string>;
  mounts?: { volume: string; path: string }[];
  [key: string]: unknown;
}

export interface Machine {
  id: string;
  name: string;
  state: string;
  region: string;
  config: MachineConfig;
}

export interface Volume {
  id: string;
  name: string;
  region: string;
  state: string;
  attached_machine_id: string | null;
}

/** Runs `fly <args>`, and returns its stdout. Throws with its last line of output if it fails. */
export async function fly(args: string[], options: { cwd?: string } = {}): Promise<string> {
  const proc = Bun.spawn(["fly", ...args], {
    env: flyEnv(),
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    const last = (stderr.trim() || stdout.trim()).split("\n").at(-1) ?? "";
    throw new Error(`fly ${args.slice(0, 2).join(" ")} failed: ${last}`);
  }
  return stdout;
}

/** The app's machine, or undefined if it has none. */
export async function findMachine(settings: Settings): Promise<Machine | undefined> {
  const machines = JSON.parse(await fly(["machine", "list", "-a", settings.app, "--json"])) as Machine[];
  const live = machines.filter((machine) => machine.state !== "destroyed" && machine.state !== "destroying");
  if (live.length > 1) {
    throw new Error(
      `Fly app ${settings.app} has ${live.length} machines, and the client works on one: ${live.map((m) => m.id).join(", ")}`,
    );
  }
  return live[0];
}

/** e.g. performance-16x, 32768 MB */
export const describeSize = (guest: Guest | undefined): string =>
  guest ? `${guest.cpu_kind}-${guest.cpus}x, ${guest.memory_mb} MB` : "unknown size";
