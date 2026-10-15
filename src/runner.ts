// Running one container run — spec/080-docker-execution.md. `run` hands each planned container
// run to a ContainerRunner and gets back its run.json. The host runner here stands in for
// Docker until it arrives: each container run gets a fresh local directory, named by its
// postrun tag, in place of the postrun image, and is kept afterwards:
//
//   <root dir>/<execution ID>/<postrun tag>/
//     workspace/         the cli's working directory; starts empty for now
//     thunderjar/
//       result.json      ctx.resultPath
//       run.json         written by the execution wrapper
//
// Base image, code state and prompt set are not applied on the host, and the environment is
// passed through unfiltered.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";
import type { PlannedContainerRun } from "./execution.ts";

/** `run.json`: when the agent started and finished (ms since the epoch), and how it exited. */
export interface ExecutionFile {
  startedAt: number;
  finishedAt: number;
  exitCode: number;
}

export interface ContainerRunner {
  runContainer(run: PlannedContainerRun): Promise<ExecutionFile>;
}

/** The exit code recorded for a command killed at its timeout, as GNU `timeout` reports it. */
export const TIMEOUT_EXIT_CODE = 124;

/** Where the host runner keeps container runs unless told otherwise: `$TMPDIR/thunderjar`. */
export const defaultRootDir = () => join(tmpdir(), "thunderjar");

/** The directory the host runner gives one execution. */
export const executionDir = (rootDir: string, executionId: string) => join(rootDir, executionId);

interface WrapperOptions {
  /** The command's working directory. */
  cwd: string;
  timeoutSeconds: number;
  /** Where to write run.json. */
  runPath: string;
  now: () => number;
}

/**
 * The execution wrapper — spec/080-docker-execution.md#the-execution-wrapper — in TypeScript
 * rather than the spec's shell snippet, whose `date +%s%3N` and `timeout` are GNU-only. Runs
 * `command` with `sh -c`, kills it and everything it started once `timeoutSeconds` pass (exit
 * code 124), and writes run.json. The command's output goes to stderr, keeping stdout for
 * Thunderjar's own progress.
 */
export async function runWrapped(command: string, { cwd, timeoutSeconds, runPath, now }: WrapperOptions) {
  const startedAt = now();
  const exitCode = await new Promise<number>((resolve, reject) => {
    // Its own process group, so the timeout can kill the command's children too.
    const child = spawn("sh", ["-c", command], { cwd, detached: true, stdio: ["ignore", 2, 2] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // Already gone.
      }
    }, timeoutSeconds * 1000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      // A shell reports death by signal N as 128 + N.
      resolve(timedOut ? TIMEOUT_EXIT_CODE : (code ?? 128 + constants.signals[signal!]));
    });
  });
  const execution: ExecutionFile = { startedAt, finishedAt: now(), exitCode };
  await writeFile(runPath, `${JSON.stringify(execution)}\n`);
  return execution;
}

/** Runs each container run on the host, in its own directory under `rootDir`. */
export function createHostRunner(rootDir: string, now: () => number = Date.now): ContainerRunner {
  return {
    async runContainer(run) {
      const dir = join(executionDir(rootDir, run.executionId), run.postrunTag);
      const workspace = join(dir, "workspace");
      const thunderjar = join(dir, "thunderjar");
      await mkdir(workspace, { recursive: true });
      await mkdir(thunderjar, { recursive: true });
      return runWrapped(run.renderCommand(join(thunderjar, "result.json")), {
        cwd: workspace,
        timeoutSeconds: run.timeoutSeconds,
        runPath: join(thunderjar, "run.json"),
        now,
      });
    },
  };
}
