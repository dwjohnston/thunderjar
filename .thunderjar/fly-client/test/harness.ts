// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// Runs the client in a temporary folder, with fake `fly`, `docker` and `ssh` first on its PATH.
// The fakes keep their state, and a log of their calls, in that folder: see fakes/.

import { $ } from "bun";
import { imageRef } from "../image.ts";
import recipe from "../machine/recipe.json";

const INDEX = `${import.meta.dir}/../index.ts`;
export const APP = "test-app";

export type Call = { command: "fly" | "docker" | "ssh"; args: string[]; flyToken: boolean };

export interface Machine {
  id: string;
  name: string;
  state: string;
  region: string;
  config: Record<string, unknown>;
}

/** A machine as `up` would have made it, with `cpus` CPUs. */
export async function machineFixture(options: { state: string; cpus?: number }): Promise<Machine> {
  const cpus = options.cpus ?? recipe.config.guest.cpus;
  return {
    id: "m-1",
    name: recipe.name,
    state: options.state,
    region: recipe.region,
    config: {
      ...recipe.config,
      image: await imageRef(APP),
      guest: { cpu_kind: "performance", cpus, memory_mb: cpus * 2048 },
      env: { FLY_SLEEP_MINUTES: "30" },
      mounts: [{ volume: "vol_1", path: recipe.volume.path }],
    },
  };
}

export interface Fixture {
  dir: string;
  timerFile: string;
  env: Record<string, string>;
  setMachines(machines: Machine[]): Promise<void>;
  machines(): Promise<Machine[]>;
  /** Containers the fake daemon says are running. */
  setRunning(ids: string[]): Promise<void>;
  setExitCode(code: number): Promise<void>;
  setConnectionOpen(): Promise<void>;
  calls(): Promise<Call[]>;
  /** The calls, each as one line, e.g. "fly machine start m-1 -a test-app". */
  callLines(): Promise<string[]>;
  run(args: string[], options?: { stdin?: string; env?: Record<string, string> }): Promise<Result>;
  spawn(args: string[], options?: { env?: Record<string, string> }): Bun.Subprocess<"ignore", "pipe", "pipe">;
  cleanup(): Promise<void>;
}

export interface Result {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// Variables the client reads, left out of the environment the tests run it in.
const CLIENT_VARIABLES = ["FLY_API_TOKEN", "FLY_APP", "FLY_ORG", "FLY_REGION", "FLYIO_INSTANCE_SIZE", "FLY_SLEEP_MINUTES", "FLY_DESTROY_MINUTES"];

export async function fixture(): Promise<Fixture> {
  const dir = (await $`mktemp -d /tmp/tjfc-XXXXXX`.text()).trim();
  const bin = `${dir}/bin`;
  for (const name of ["fly", "docker", "ssh"]) {
    await Bun.write(`${bin}/${name}`, `#!/bin/sh\nexec "${process.execPath}" "${import.meta.dir}/fakes/${name}.ts" "$@"\n`);
  }
  await $`chmod +x ${bin}/fly ${bin}/docker ${bin}/ssh`;

  const inherited = Object.fromEntries(
    Object.entries(Bun.env).filter(([name]) => !CLIENT_VARIABLES.includes(name)),
  ) as Record<string, string>;
  const timerFile = `${dir}/.fly`;
  const env: Record<string, string> = {
    ...inherited,
    PATH: `${bin}:${Bun.env.PATH}`,
    FAKE_DIR: dir,
    FLY_APP: APP,
    FLYIO_TOKEN: "fake-token",
    FLY_TIMER_FILE: timerFile,
    FLY_CLIENT_DIR: `${dir}/runtime`,
    FLY_CLIENT_LOG_FILE: `${dir}/fly-client.log`,
    FLY_CLIENT_PROGRESS: "0",
    FLY_CLIENT_POLL_MS: "10",
  };

  const write = (name: string, content: string) => Bun.write(`${dir}/${name}`, content).then(() => {});
  const calls = async (): Promise<Call[]> => {
    const file = Bun.file(`${dir}/calls.jsonl`);
    if (!(await file.exists())) return [];
    return (await file.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Call);
  };

  return {
    dir,
    timerFile,
    env,
    setMachines: (machines) => write("machines.json", JSON.stringify(machines)),
    machines: async () => {
      const file = Bun.file(`${dir}/machines.json`);
      return (await file.exists()) ? ((await file.json()) as Machine[]) : [];
    },
    setRunning: (ids) => write("running", ids.map((id) => `${id}\n`).join("")),
    setExitCode: (code) => write("exit-code", String(code)),
    setConnectionOpen: () => write("ssh-open", "open"),
    calls,
    callLines: async () => (await calls()).map((call) => [call.command, ...call.args].join(" ")),
    async run(args, options = {}) {
      const proc = Bun.spawn([process.execPath, INDEX, ...args], {
        cwd: dir,
        env: { ...env, ...options.env },
        stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { exitCode, stdout, stderr };
    },
    spawn(args, options = {}) {
      return Bun.spawn([process.execPath, INDEX, ...args], {
        cwd: dir,
        env: { ...env, ...options.env },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
    },
    async cleanup() {
      const timer = Bun.file(timerFile);
      if (await timer.exists()) {
        const pid = ((await timer.json()) as { watcherPid?: number }).watcherPid;
        if (pid) {
          try {
            process.kill(pid);
          } catch {
            // Already gone.
          }
        }
      }
      await $`rm -rf ${dir}`;
    },
  };
}

/** Waits until `check` passes, or fails after `ms`. */
export async function eventually(check: () => Promise<boolean>, ms = 5000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("timed out waiting");
    await Bun.sleep(20);
  }
}
