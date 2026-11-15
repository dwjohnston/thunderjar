/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// The host's side of an execution that runs on the runtime, in a runner (see runner.ts): it makes
// sure the image store has every prerun image and the runner image, starts the runner's container
// with the runtime's command, sends it the submission, and follows the events it writes. The
// runner's container is `<prefix>-runner-<execution ID>`, so an execution is found again by its ID.
import type { BuildOptions, ImageStore } from "../api/declarations.ts";
import { ConfigError } from "../config/loader.ts";
import type { ProjectConfig } from "../config/projectConfig.ts";
import {
  containerState,
  DockerContainerError,
  followLogs,
  inRegistry,
  readContainerFile,
  remoteRuntime,
  removeContainer,
  removeContainersNamed,
  startDetached,
  stderrTail,
  stopContainer,
  writeContainerFile,
} from "../docker/docker.ts";
import { moduleLogger } from "../log/logger.ts";
import { DEFAULT_IMAGE_PREFIX, executionContainerPrefix, storedPrerunImage } from "./images.ts";
import { type PushHooks, pushToStore } from "./imageStore.ts";
import { inParallel } from "./inParallel.ts";
import type { PlannedExecution } from "./planExecution.ts";
import { buildPrerunImage, type PrerunBuildHooks, prerunImages } from "./prerunBuilds.ts";
import { isLast, type RunnerEvent } from "./runnerEvents.ts";
import { RUNNER_LOG_PATH, SUBMISSION_DIR, SUBMISSION_PATH } from "./runnerImage.ts";
import type { Submission } from "./runnerSpec.ts";
import { type Timer, untimed } from "./timings.ts";

const log = moduleLogger("onRuntime");

type RunnerOptions = NonNullable<NonNullable<ProjectConfig["runtime"]>["runner"]>;

/** The container an execution's runner runs in, on the runtime. */
export const runnerContainer = (executionId: string, prefix: string = DEFAULT_IMAGE_PREFIX) => `${prefix}-runner-${executionId}`;

/**
 * Makes sure `imageStore` has the prerun image of each of `plan`'s permutations, of a test case
 * under `root`, once per image hash, up to `build.concurrency` at once: one the store has is
 * left, one that's only in the runtime's Docker daemon, which `command` reaches, is pushed from
 * there, and any other is built there, then pushed. Nothing is built here. Throws what building
 * and pushing throw; once one fails, no other starts.
 */
export async function storePrerunImages(
  root: string,
  plan: PlannedExecution,
  imagePrefix: string | undefined,
  imageStore: ImageStore,
  command: string[],
  build: BuildOptions = {},
  hooks: PrerunBuildHooks & PushHooks = {},
  time: Timer = untimed,
): Promise<void> {
  const runtime = remoteRuntime(command);
  const images = await prerunImages(
    plan.permutations.map(({ permutation }) => permutation),
    imagePrefix,
    runtime,
  );
  let failed = false;
  await inParallel(
    images.map(({ exists, ...image }) => async () => {
      if (failed) return;
      try {
        const reference = storedPrerunImage(imageStore.repository, image.permutation.imageHash);
        // Its tag is its content's hash: if the store has it, it's neither built nor pushed again.
        if (await inRegistry(reference)) {
          log.info({ image: image.image, reference }, "prerun image already in the image store: not built or pushed");
          return;
        }
        if (!exists) await time("build", () => buildPrerunImage(root, image, hooks, build, runtime));
        await time("pushPrerun", () => pushToStore(image.image, reference, hooks, runtime));
      } catch (error) {
        failed = true;
        throw error;
      }
    }),
    build.concurrency ?? 1,
  );
}

/** Thunderjar's own variables a runner is given if they're set here: how long a container may take to start. */
const PASSED_SETTINGS = ["THUNDERJAR_START_TIMEOUT_SECONDS"];

/**
 * The variables a runner is given for `plan`: those its harnesses need, the run data store's
 * URL, the registry login's, and `runner.env`, with their values from `env`, and those of
 * PASSED_SETTINGS that are set. Throws a ConfigError
 * naming each that's unset: an empty value counts as unset.
 */
export function submissionEnv(
  plan: PlannedExecution,
  runDataStore: ProjectConfig["runDataStore"],
  runner: RunnerOptions,
  env: Record<string, string | undefined> = Bun.env,
): Record<string, string> {
  const names = new Set([
    ...plan.permutations.flatMap((permutation) => permutation.env),
    ...(runDataStore.kind === "postgres" ? [runDataStore.urlEnv] : []),
    ...(runner.registryLogin ? [runner.registryLogin.usernameEnv, runner.registryLogin.passwordEnv] : []),
    ...runner.env,
  ]);
  const missing = [...names].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new ConfigError(
      `The runner on the runtime needs ${missing.join(", ")}, which ${missing.length === 1 ? "is" : "are"} not set.\nExport ${missing.length === 1 ? "it" : "them"} in the shell that runs thunderjar.`,
    );
  }
  // Thunderjar's own settings that change how the runner runs the execution, passed on if they're set.
  const settings = PASSED_SETTINGS.filter((name) => env[name]);
  return Object.fromEntries([...names, ...settings].map((name) => [name, env[name] as string]));
}

/**
 * Starts the runner of `submission`'s execution on the runtime `command` reaches, in a container
 * from `runnerImage`, and sends it the submission. Its variables' values go over the command's
 * input into a tmpfs in the container: never on a command line, in the image, or on the
 * runtime's disk. Throws a DockerPullError if the runtime can't pull the runner image, or a
 * DockerContainerError, after removing the container.
 */
export async function submitExecution(command: string[], runnerImage: string, submission: Submission, runOptions: string[] = []): Promise<string> {
  const runtime = remoteRuntime(command);
  const container = runnerContainer(submission.plan.executionId, submission.imagePrefix);
  const options = ["--init", "--tmpfs", `${SUBMISSION_DIR}:mode=0700`, "-v", "/var/run/docker.sock:/var/run/docker.sock", ...runOptions];
  log.info({ container, runnerImage, env: Object.keys(submission.env) }, "submitting the execution to a runner");
  await startDetached(runnerImage, container, options, runtime);
  try {
    await writeContainerFile(container, SUBMISSION_PATH, JSON.stringify(submission), runtime);
  } catch (error) {
    await removeContainer(container, runtime).catch(() => {});
    throw error;
  }
  return container;
}

/** Thrown when a runner ends, or can't be found, without having said how its execution ended. */
export class RunnerLostError extends Error {}

/** Thrown when the runtime can't be asked about a runner, which may still be running its execution. */
export class RunnerUnreachableError extends Error {}

/** How long, and how often, a follower waits to ask a runtime it can't reach about a runner. */
const RECONNECT_MS = 3000;
const RECONNECT_ATTEMPTS = 40;

/**
 * Follows the runner of execution `executionId` on the runtime `command` reaches, calling
 * `onEvent` with each event it has written, from its first, until its last, and returns
 * `ended`. If the connection drops, it follows again, and carries on after the last event it
 * gave. If `signal` aborts first, returns `detached`: the runner carries on. Throws a
 * RunnerLostError if there's no such runner, or it stopped without a last event, and a
 * RunnerUnreachableError if the runtime can't be reached to tell.
 */
export async function followRunner(
  command: string[],
  executionId: string,
  imagePrefix: string | undefined,
  onEvent: (event: RunnerEvent) => void,
  signal?: AbortSignal,
  reconnectMs = RECONNECT_MS,
): Promise<"ended" | "detached"> {
  const runtime = remoteRuntime(command);
  const container = runnerContainer(executionId, imagePrefix);
  let seen = 0;
  let ended = false;
  // Once it has stopped, its events are read once more, whole, in case the connection dropped before its last.
  let stopped = false;
  for (;;) {
    let index = 0;
    await followLogs(
      container,
      runtime,
      (line) => {
        if (index++ < seen || ended) return;
        seen++;
        let event: RunnerEvent;
        try {
          event = JSON.parse(line) as RunnerEvent;
        } catch {
          log.warn({ container, line: line.slice(0, 200) }, "the runner wrote a line that isn't an event");
          return;
        }
        if (isLast(event)) ended = true;
        onEvent(event);
      },
      signal,
    );
    if (ended) return "ended";
    if (signal?.aborted) return "detached";
    let state: Awaited<ReturnType<typeof containerState>> | undefined;
    for (let attempt = 1; ; attempt++) {
      try {
        state = await containerState(container, runtime);
        break;
      } catch (error) {
        if (!(error instanceof DockerContainerError) || attempt >= RECONNECT_ATTEMPTS) {
          throw new RunnerUnreachableError(`The runtime can't be asked about runner ${container}: ${error instanceof Error ? error.message : String(error)}`);
        }
        log.warn({ container, attempt, err: error }, "couldn't reach the runtime: trying again");
        await Bun.sleep(reconnectMs);
        if (signal?.aborted) return "detached";
      }
    }
    if (state === undefined) throw new RunnerLostError(`There's no runner for execution ${executionId} on the runtime: no container ${container}.`);
    if (state.running) {
      log.warn({ container, seen }, "stopped following a runner that's still running: following again");
      await Bun.sleep(reconnectMs);
      continue;
    }
    if (stopped) {
      const tail = await stderrTail(container, runtime);
      throw new RunnerLostError(`The runner of execution ${executionId} stopped (exit code ${state.exitCode}) without saying how the execution ended.${tail ? `\n${tail}` : ""}`);
    }
    stopped = true;
  }
}

/** How long a runner being stopped is given to stop its containers and record its execution as failed. */
const STOP_GRACE_SECONDS = 30;

/** The runner's diagnostic log, of execution `executionId`, or undefined if it can't be read. */
export async function runnerLog(command: string[], executionId: string, imagePrefix?: string): Promise<string | undefined> {
  return readContainerFile(runnerContainer(executionId, imagePrefix), RUNNER_LOG_PATH, remoteRuntime(command)).catch(() => undefined);
}

/**
 * Stops execution `executionId` on the runtime `command` reaches: its runner, then every
 * container it left. Returns the names of the containers removed. Throws a DockerContainerError.
 */
export async function stopOnRuntime(command: string[], executionId: string, imagePrefix?: string): Promise<string[]> {
  const runtime = remoteRuntime(command);
  // Stopped, not killed, so the runner removes the containers it's running and records the execution as failed.
  await stopContainer(runnerContainer(executionId, imagePrefix), STOP_GRACE_SECONDS, runtime).catch(() => {});
  const runner = await removeContainersNamed(runnerContainer(executionId, imagePrefix), runtime);
  const rest = await removeContainersNamed(executionContainerPrefix(executionId, imagePrefix), runtime);
  log.warn({ executionId, removed: [...runner, ...rest] }, "stopped the execution on the runtime");
  return [...runner, ...rest];
}

/** Removes the runner's container of execution `executionId`, once it has ended. Never throws. */
export async function removeRunner(command: string[], executionId: string, imagePrefix?: string): Promise<void> {
  await removeContainer(runnerContainer(executionId, imagePrefix), remoteRuntime(command)).catch((error: unknown) => log.warn({ executionId, err: error }, "couldn't remove the runner's container"));
}
