/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// The composition root: `createApp` takes the services, and runs the CLI with them. src/cli/index.ts
// gives it the real ones; a test gives it fakes, and runs the CLI in its own process:
//
//   const app = createApp({ clock, docker, ids: new FakeIds(), io: new FakeIo(), launch: { cwd: scenario("0202"), env: {} } });
//   expect(await app.cli(["build", "is-prime-baseline"])).toBe(0);
import { CommanderError } from "commander";
import type { DockerService } from "../docker/dockerService.ts";
import type { Ids } from "../execution/ids.ts";
import type { Io } from "../io/io.ts";
import type { LogLevel } from "../log/logger.ts";
import type { Clock } from "../time/clock.ts";
import { createProgram } from "./program.ts";

/** Environment variables. */
export type Env = Record<string, string | undefined>;

/** What the command was started with. Data, not a service: a test writes the values. */
export type Launch = {
  /** The folder it was run in. */
  cwd: string;
  /** The environment variables. `{}` means none are set, not "inherit mine". */
  env: Env;
};

export type AppServices = {
  clock: Clock;
  docker: DockerService;
  ids: Ids;
  io: Io;
  launch: Launch;
  /** Opens the diagnostic log. index.ts passes configureLog; a test leaves it out, and nothing is logged. */
  log?: (options: { path: string; level: LogLevel }) => void;
};

/** One `app.cli()` call: the services, where its command publishes its state, and its exit code. */
export type CommandRun = AppServices & {
  /** Sets what `app.state()` returns. */
  publish(state: unknown): void;
  /** What `app.cli()` resolves to. 0 unless the command sets it. */
  exitCode: number;
};

export type App = {
  /** Runs `thunderjar <args…>`. Resolves to its exit code. Never exits the process. */
  cli(args: string[]): Promise<number>;
  /** A copy of the state the command last run published, as that command's state type. */
  state<S = unknown>(): S;
};

export function createApp(services: AppServices): App {
  let state: unknown;
  return {
    async cli(args) {
      const run: CommandRun = { ...services, exitCode: 0, publish: (next) => void (state = next) };
      try {
        // A new program each time: commander keeps the options it parsed on its commands.
        await createProgram(run).parseAsync(args, { from: "user" });
      } catch (error) {
        // `--help`, `--version`, and errors in the arguments, which commander has already written.
        if (error instanceof CommanderError) return error.exitCode;
        throw error;
      }
      return run.exitCode;
    },
    state: <S>() => structuredClone(state) as S,
  };
}
