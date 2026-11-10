// One container run: its prerun image's `thunderjar-run.sh`, run in a container from the image,
// in the image's working directory, then committed into its postrun image. The container is
// removed afterwards, whatever happens.
import {
  commitContainer,
  DockerContainerError,
  readContainerFile,
  removeContainer,
  runContainer,
} from "../docker/docker.ts";
import type { Execution } from "../store/runDataStore.ts";
import { RESULT_PATH, RUN_PATH, timedRun } from "./runScript.ts";

export { NOW_MS_FUNCTION, RUN_PATH } from "./runScript.ts";

export type ContainerRun = {
  prerunImage: string;
  postrunImage: string;
  /** The names of the environment variables passed into the container, from Thunderjar's own. */
  env: string[];
  /** More `docker run` options, from its base image. */
  runOptions: string[];
  /** How long its run script may run before it's killed. */
  timeoutSeconds: number;
  /** The container's name. */
  container: string;
};

export type ContainerRunOutcome = {
  execution: Execution;
  /** The text of its result file, or null if it left none. */
  harnessResult: string | null;
};

/** Whether `value` is plausibly ms since the epoch: from 2001-09-09 (13 digits) up to 2286. */
const isEpochMs = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1e12 && (value as number) < 1e13;

/** Whether `value` is how one turn ran, as the run script records it. */
const isTurn = (value: unknown): value is { startedAt: number; finishedAt: number; exitCode: number } => {
  const { startedAt, finishedAt, exitCode } = (value ?? {}) as Record<string, unknown>;
  return isEpochMs(startedAt) && isEpochMs(finishedAt) && typeof exitCode === "number";
};

/**
 * The Execution in the text of RUN_PATH, of a run with a limit of `timeoutSeconds`. If it was
 * killed at `killedAt`, RUN_PATH holds only its start, and it finished when it was killed. Throws
 * a DockerContainerError if it isn't a valid one.
 */
export function parseExecution(text: string | undefined, timeoutSeconds: number, killedAt?: number): Execution {
  let parsed: Partial<Execution> | undefined;
  try {
    parsed = text === undefined ? undefined : (JSON.parse(text) as Partial<Execution>);
  } catch {
    parsed = undefined;
  }
  const { startedAt, finishedAt, exitCode, turns } = parsed ?? {};
  const invalid = () =>
    new DockerContainerError(`The run script left no valid ${RUN_PATH}: ${text === undefined ? "there is none" : text.trim()}`);
  if (!isEpochMs(startedAt)) throw invalid();
  if (killedAt !== undefined) return { startedAt, finishedAt: killedAt, exitCode: null, timedOut: true, timeoutSeconds };
  if (!isEpochMs(finishedAt) || typeof exitCode !== "number") throw invalid();
  if (turns !== undefined && (!Array.isArray(turns) || !turns.every(isTurn))) throw invalid();
  return { startedAt, finishedAt, exitCode, timedOut: false, timeoutSeconds, ...(turns && { turns }) };
}

/**
 * Runs `run`, commits its container into its postrun image, even when the agent exits
 * non-zero or is killed for taking longer than its timeout, and removes the container. Throws a
 * DockerContainerError if Docker fails.
 */
export async function runInContainer(run: ContainerRun): Promise<ContainerRunOutcome> {
  try {
    const stop = await runContainer(run.prerunImage, run.container, timedRun(), {
      env: run.env,
      runOptions: run.runOptions,
      timeoutSeconds: run.timeoutSeconds,
    });
    const killedAt = stop.timedOut ? stop.killedAt : undefined;
    const execution = parseExecution(await readContainerFile(run.container, RUN_PATH), run.timeoutSeconds, killedAt);
    const harnessResult = (await readContainerFile(run.container, RESULT_PATH)) ?? null;
    await commitContainer(run.container, run.postrunImage, run.prerunImage);
    return { execution, harnessResult };
  } finally {
    await removeContainer(run.container).catch(() => {});
  }
}
