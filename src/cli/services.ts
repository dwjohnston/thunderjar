// The services a command is given, built once, in src/cli/index.ts.
import type { RuntimeConfig } from "../api/declarations.ts";
import type { Clock } from "../services/Clock/Clock.ts";
import type { Docker } from "../services/Docker/Docker.ts";
import type { Env } from "../services/Env/Env.ts";
import type { Io } from "../services/Io/Io.ts";

export type Services = {
  clock: Clock;
  env: Env;
  io: Io;
  /** Docker on the machine Thunderjar runs on: registry logins, its own images, `doctor`'s probe, and everything with `--local`. */
  hostDocker: Docker;
  /**
   * Docker where containers run: the runtime a project's config gives, once a command has loaded
   * it. For `null`, no runtime or `--local`, it's `hostDocker` itself. See src/cli/HUMANS.md.
   */
  runtimeDocker: (runtime: Pick<RuntimeConfig, "command"> | null) => Docker;
};
