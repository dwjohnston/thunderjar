// The services a command is given, built once, in src/cli/index.ts.
import type { Manifest, RunSettings } from "../runNext/types.ts";
import type { ApplicationStateService } from "../services/ApplicationState/ApplicationState.ts";
import type { Clock } from "../services/Clock/Clock.ts";
import type { Displayer } from "../services/Displayer/Displayer.ts";
import type { DockerService } from "../services/Docker/Docker.ts";
import type { Env } from "../services/Env/Env.ts";
import type { Fs } from "../services/Fs/Fs.ts";
import type { Io } from "../services/Io/Io.ts";
import type { Random } from "../services/Random/Random.ts";
import type { RunDataStore } from "../services/RunDataStore/RunDataStore.ts";

export type Services = {
  clock: Clock;
  env: Env;
  io: Io;
  /** Docker on the machine Thunderjar runs on: registry logins, its own images, `doctor`'s probe. */
  hostDocker: DockerService;
  /**
   * Docker where containers run: the runtime the project's config gives. With none, or outside a
   * project, it's `hostDocker` itself. See src/cli/HUMANS.md.
   */
  runtimeDocker: DockerService;
  /**
   * The run data store: SQLite in `--data-dir` if given, or else the config's `runDataStore`. Opened
   * on first use, so a command that never uses it never fails on it. `run` uses it; other commands
   * still open their own with `openStore`, in src/cli/dataDir.ts.
   */
  runDataStore: RunDataStore;
  /** Where `runDataStore` is: a file's path, or a description of a database. Opens it. */
  runDataStoreLocation: () => Promise<string>;
  random: Random;
  fs: Fs;
  /** The run state `run` writes to and `displayer` shows. */
  state: ApplicationStateService<Manifest>;
  displayer: Displayer;
  /** Concurrency, upload and warm-up settings for `run`, read from the environment variables. */
  runSettings: RunSettings;
};
