// The services a command is given, built once, in src/cli/index.ts.
import type { Clock } from "../services/Clock/Clock.ts";
import type { DockerService } from "../services/Docker/Docker.ts";
import type { Env } from "../services/Env/Env.ts";
import type { Io } from "../services/Io/Io.ts";
import type { RunDataStore } from "../services/RunDataStore/RunDataStore.ts";

export type Services = {
  clock: Clock;
  env: Env;
  io: Io;
  /** Docker on the machine Thunderjar runs on: registry logins, its own images, `doctor`'s probe, and everything with `--local`. */
  hostDocker: DockerService;
  /**
   * Docker where containers run: the runtime the project's config gives. With none, or outside a
   * project, it's `hostDocker` itself. A command given `--local` uses `hostDocker` instead. See src/cli/HUMANS.md.
   */
  runtimeDocker: DockerService;
  /**
   * The run data store: SQLite in `--data-dir` if given, or else the config's `runDataStore`. Opened
   * on first use, so a command that never uses it never fails on it. Not used yet: commands still
   * open their own with `openStore`, in src/cli/dataDir.ts.
   */
  runDataStore: RunDataStore;
};
