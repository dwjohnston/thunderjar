// Running one container run — spec/080-docker-execution.md. `run` hands each planned container
// run to a ContainerRunner and gets back its run.json.
//
// The Docker runner is the real one: it starts a container from the run's prerun image, runs
// the harness's cli inside the execution wrapper, and commits the stopped container into the
// postrun image, `<repository>:<postrun tag>`, which keeps the agent's /workspace, its
// /thunderjar/result.json and the wrapper's /thunderjar/run.json.
//
// The host runner stands in for Docker in tests of what `run` does around a container run:
// each container run gets a fresh local directory, named by its postrun tag, in place of the
// postrun image, and is kept afterwards:
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
// Measuring has its own seam beside it: a MeasurementOpener gives a MeasurementContext over
// one postrun image, a fresh one for each measurement. Both openers here work over a scratch
// copy of the run's workspace on the host, in place of a measurement container, so nothing a
// measurement writes reaches the postrun image or the next measurement: the Docker one copies
// it out of the postrun image, the host one out of the kept directory. Measuring on the host
// means instruments run with the host's tools (templateTest's `bun test`), not the image's.

import { copy, exists, makeDir, makeTempDir, remove, tmpdir } from "../platform/fs.ts";
import { join, resolve } from "../platform/path.ts";
import { signalNumber } from "../platform/signals.ts";
import type { Docker } from "../adapters/docker/docker.ts";
import type { MeasurementContext } from "../api/declarations.ts";
import type { PlannedContainerRun } from "../matrix/execution.ts";
import { imageRef, postrunTagExecutionId } from "../matrix/tags.ts";

/** `run.json`: when the agent started and finished (ms since the epoch), and how it exited. */
export interface ExecutionFile {
  startedAt: number;
  finishedAt: number;
  exitCode: number;
}

export interface ContainerRunner {
  runContainer(run: PlannedContainerRun): Promise<ExecutionFile>;
}

/** A MeasurementContext of its own for one measurement, discarded by `close`. */
export interface OpenedMeasurementContext extends MeasurementContext {
  close(): Promise<void>;
}

export interface MeasurementOpener {
  /**
   * A fresh context for the container run tagged `postrunTag`, which instruments run against.
   * Nothing written through one is seen by another.
   */
  openMeasurementContext(postrunTag: string): Promise<OpenedMeasurementContext>;
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
  // Its own process group, so the timeout can kill the command's children too.
  const child = Bun.spawn(["sh", "-c", command], { cwd, detached: true, stdio: ["ignore", 2, 2] });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }, timeoutSeconds * 1000);
  try {
    await child.exited;
  } finally {
    clearTimeout(timer);
  }
  const exitCode = timedOut ? TIMEOUT_EXIT_CODE : exitCodeOf(child);
  const execution: ExecutionFile = { startedAt, finishedAt: now(), exitCode };
  await Bun.write(runPath, `${JSON.stringify(execution)}\n`);
  return execution;
}

/** A finished process's exit code; a shell reports death by signal N as 128 + N. */
const exitCodeOf = (proc: Bun.Subprocess) => proc.exitCode ?? 128 + signalNumber(proc.signalCode!);

/** Runs each container run on the host, in its own directory under `rootDir`. */
export function createHostRunner(rootDir: string, now: () => number = Date.now): ContainerRunner {
  return {
    async runContainer(run) {
      const dir = join(executionDir(rootDir, run.executionId), run.postrunTag);
      const workspace = join(dir, "workspace");
      const thunderjar = join(dir, "thunderjar");
      await makeDir(workspace);
      await makeDir(thunderjar);
      return runWrapped(run.renderCommand(join(thunderjar, "result.json")), {
        cwd: workspace,
        timeoutSeconds: run.timeoutSeconds,
        runPath: join(thunderjar, "run.json"),
        now,
      });
    },
  };
}

/** `text` as one shell word. */
const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * The execution wrapper as it runs in a container — spec/080-docker-execution.md#the-execution-wrapper.
 * GNU `timeout` sends TERM to the command's whole process group at `timeoutSeconds`, KILL 5s
 * later if it's still there, and exits 124. The command's output goes to stderr; the wrapper
 * prints run.json on stdout, as it writes it.
 */
export const containerWrapper = (command: string, timeoutSeconds: number) =>
  [
    "mkdir -p /thunderjar",
    "start=$(date +%s%3N)",
    `timeout -k 5 ${timeoutSeconds} sh -c ${shellQuote(command)} >&2`,
    "code=$?",
    "end=$(date +%s%3N)",
    `echo "{\\"startedAt\\":$start,\\"finishedAt\\":$end,\\"exitCode\\":$code}" > /thunderjar/run.json`,
    "cat /thunderjar/run.json",
  ].join("\n");

/**
 * Runs each container run in a container from its prerun image in `repository`, and commits it
 * into its postrun image there, even when the agent fails. The container is removed afterwards.
 */
export function createDockerRunner(docker: Docker, repository: string): ContainerRunner {
  return {
    async runContainer(run) {
      const prerun = imageRef(repository, run.prerunTag);
      const name = `thunderjar-${run.postrunTag}-${crypto.randomUUID().slice(0, 8)}`;
      try {
        const { exitCode, stdout } = await docker.run(prerun, name, containerWrapper(run.command, run.timeoutSeconds));
        const runJson = stdout.trim().split("\n").at(-1) ?? "";
        if (exitCode !== 0 || !runJson.startsWith("{")) {
          throw new Error(`error: running a container from ${prerun} failed (docker run exited ${exitCode}).`);
        }
        await docker.commit(name, imageRef(repository, run.postrunTag), prerun);
        return JSON.parse(runJson) as ExecutionFile;
      } finally {
        await docker.removeContainer(name).catch(() => {});
      }
    },
  };
}

/** Runs `command` with `sh -c` in `cwd`, collecting its output. */
async function exec(command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const child = Bun.spawn(["sh", "-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, exitCode: exitCodeOf(child) };
}

/**
 * Measurement contexts over the directories the host runner kept under `rootDir`. `workdir`
 * is a scratch copy of the run's `workspace/`, where paths, globs and `exec` resolve, and
 * `close` deletes it; `harnessResult` is its `thunderjar/result.json`, or empty if the cli
 * wrote none. Throws if the run wasn't kept there.
 */
export function createHostMeasurementOpener(rootDir: string): MeasurementOpener {
  return {
    async openMeasurementContext(postrunTag) {
      const executionId = postrunTagExecutionId(postrunTag);
      if (!executionId) throw new Error(`not a postrun tag: ${postrunTag}`);
      const dir = join(executionDir(rootDir, executionId), postrunTag);
      const kept = join(dir, "workspace");
      if (!(await exists(kept))) throw new Error(`no container run kept for ${postrunTag} (expected ${kept})`);
      const resultPath = join(dir, "thunderjar", "result.json");
      const harnessResult = (await exists(resultPath)) ? await Bun.file(resultPath).text() : "";
      const workdir = await makeTempDir("thunderjar-measure-");
      await copy(kept, workdir).catch(async (error: unknown) => {
        await remove(workdir);
        throw error;
      });
      return scratchContext(workdir, harnessResult, workdir);
    },
  };
}

/**
 * Measurement contexts over postrun images in `repository`. `workdir` is a scratch copy of
 * the image's /workspace, and `harnessResult` its /thunderjar/result.json, or empty if the cli
 * wrote none. Throws if the image can't be read.
 */
export function createDockerMeasurementOpener(docker: Docker, repository: string): MeasurementOpener {
  return {
    async openMeasurementContext(postrunTag) {
      const scratch = await makeTempDir("thunderjar-measure-");
      const workdir = join(scratch, "workspace");
      const name = `thunderjar-measure-${crypto.randomUUID().slice(0, 8)}`;
      try {
        await makeDir(workdir);
        await docker.create(imageRef(repository, postrunTag), name);
        await docker.copyFrom(name, "/workspace/.", workdir);
        const resultPath = join(scratch, "result.json");
        // A cli may write no result file.
        await docker.copyFrom(name, "/thunderjar/result.json", resultPath).catch(() => {});
        const harnessResult = (await exists(resultPath)) ? await Bun.file(resultPath).text() : "";
        return scratchContext(workdir, harnessResult, scratch);
      } catch (error) {
        await remove(scratch);
        throw error;
      } finally {
        await docker.removeContainer(name).catch(() => {});
      }
    },
  };
}

/** A context over the scratch copy `workdir`; `close` deletes `scratch`, which holds it. */
function scratchContext(workdir: string, harnessResult: string, scratch: string): OpenedMeasurementContext {
  return {
    workdir,
    harnessResult,
    exec: (command) => exec(command, workdir),
    readFile: (path) => Bun.file(resolve(workdir, path)).text(),
    async writeFile(path, contents) {
      await Bun.write(resolve(workdir, path), contents);
    },
    glob: async (pattern) => (await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: workdir, dot: true }))).toSorted(),
    close: () => remove(scratch),
  };
}
