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
//
// Measuring has its own seam beside it: a MeasurementOpener gives the MeasurementContext of
// one postrun image. The host one here works over the kept directory in place of a
// measurement container.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { MeasurementContext } from "./declarations.ts";
import type { PlannedContainerRun } from "./execution.ts";
import { postrunTagExecutionId } from "./tags.ts";

/** `run.json`: when the agent started and finished (ms since the epoch), and how it exited. */
export interface ExecutionFile {
  startedAt: number;
  finishedAt: number;
  exitCode: number;
}

export interface ContainerRunner {
  runContainer(run: PlannedContainerRun): Promise<ExecutionFile>;
}

export interface MeasurementOpener {
  /** The context instruments run against for the container run tagged `postrunTag`. */
  openMeasurementContext(postrunTag: string): Promise<MeasurementContext>;
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

/** Runs `command` with `sh -c` in `cwd`, collecting its output. */
function exec(command: string, cwd: string) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const child = spawn("sh", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ stdout, stderr, exitCode: code ?? 128 + constants.signals[signal!] }));
  });
}

/**
 * Measurement contexts over the directories the host runner kept under `rootDir`. `workdir`
 * is the run's `workspace/`, where paths, globs and `exec` resolve; `harnessResult` is its
 * `thunderjar/result.json`, or empty if the cli wrote none. Throws if the run wasn't kept there.
 */
export function createHostMeasurementOpener(rootDir: string): MeasurementOpener {
  return {
    async openMeasurementContext(postrunTag) {
      const executionId = postrunTagExecutionId(postrunTag);
      if (!executionId) throw new Error(`not a postrun tag: ${postrunTag}`);
      const dir = join(executionDir(rootDir, executionId), postrunTag);
      const workdir = join(dir, "workspace");
      if (!existsSync(workdir)) throw new Error(`no container run kept for ${postrunTag} (expected ${workdir})`);
      const resultPath = join(dir, "thunderjar", "result.json");
      const harnessResult = existsSync(resultPath) ? await readFile(resultPath, "utf8") : "";
      return {
        workdir,
        harnessResult,
        exec: (command) => exec(command, workdir),
        readFile: (path) => readFile(resolve(workdir, path), "utf8"),
        writeFile: (path, contents) => writeFile(resolve(workdir, path), contents),
        glob: async (pattern) => (await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: workdir, dot: true }))).toSorted(),
      };
    },
  };
}
