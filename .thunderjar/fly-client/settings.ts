// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// What the client works on, read from the environment. Bun loads the repository's .env, when run
// from its root, so the variables can live there.

import recipe from "./machine/recipe.json";

export interface Settings {
  /** The Fly app. It holds one machine, the one remote runs use. */
  app: string;
  /** The org `fly ssh issue` gives certificates for. */
  org: string;
  region: string;
  /** CPUs, from FLYIO_INSTANCE_SIZE. Unset, an existing machine keeps its size. */
  cpus: number | undefined;
  sleepMinutes: number;
  destroyMinutes: number;
  /** The timer file, `.thunderjar/.fly`. */
  timerFile: string;
  /** The SSH config, certificate and control socket, locks, and the markers of commands in flight. */
  runtimeDir: string;
  /** How long the waits between checks are. `watch` checks the timer every 10 of these. */
  pollMs: number;
}

const DEFAULT_SLEEP_MINUTES = 30;
const DEFAULT_DESTROY_MINUTES = 7 * 24 * 60;

const positive = (env: Record<string, string | undefined>, name: string, fallback: number): number => {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!(value > 0)) throw new Error(`${name} must be a positive number, got '${raw}'`);
  return value;
};

export function readSettings(env: Record<string, string | undefined> = Bun.env): Settings {
  const app = env.FLY_APP || "thunderjar-runtime-dwj";
  const size = env.FLYIO_INSTANCE_SIZE;
  if (size && !/^[1-9][0-9]*$/.test(size.trim())) {
    throw new Error(`FLYIO_INSTANCE_SIZE must be a whole number of CPUs, got '${size}'`);
  }
  return {
    app,
    org: env.FLY_ORG || "personal",
    region: env.FLY_REGION || recipe.region,
    cpus: size ? Number(size) : undefined,
    sleepMinutes: positive(env, "FLY_SLEEP_MINUTES", DEFAULT_SLEEP_MINUTES),
    destroyMinutes: positive(env, "FLY_DESTROY_MINUTES", DEFAULT_DESTROY_MINUTES),
    timerFile: env.FLY_TIMER_FILE || `${import.meta.dir}/../.fly`,
    // Short, because the SSH control socket's path inside it must fit in a Unix socket address.
    runtimeDir: env.FLY_CLIENT_DIR || `/tmp/tjfly-${app}`,
    pollMs: positive(env, "FLY_CLIENT_POLL_MS", 3000),
  };
}

/** The environment for `fly`: it reads FLY_API_TOKEN, this repository sets FLYIO_TOKEN. */
export function flyEnv(env: Record<string, string | undefined> = Bun.env): Record<string, string | undefined> {
  return { ...env, FLY_API_TOKEN: env.FLY_API_TOKEN || env.FLYIO_TOKEN };
}
