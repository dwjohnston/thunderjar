// The services a command is given, built once, in src/cli/index.ts.
import type { Clock } from "../services/Clock/Clock.ts";
import type { Docker } from "../services/Docker/Docker.ts";
import type { Env } from "../services/Env/Env.ts";
import type { Io } from "../services/Io/Io.ts";

export type Services = {
  clock: Clock;
  env: Env;
  io: Io;
  docker: Docker;
};
