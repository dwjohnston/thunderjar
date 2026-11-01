// One container run: a harness's `cli` command, run inside Thunderjar's execution wrapper in a
// container from its permutation's prerun image, then committed into its postrun image. The
// container is removed afterwards, whatever happens.
import {
  commitContainer,
  DockerContainerError,
  readContainerFile,
  removeContainer,
  runContainer,
} from "../docker/docker.ts";
import type { Execution } from "../store/runDataStore.ts";
import { RESULT_PATH } from "./planExecution.ts";

/** Where, inside the container, the execution wrapper records how the agent ran. */
export const RUN_PATH = "/thunderjar/run.json";

/** `text` as one shell word. */
const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * The execution wrapper: runs `command` and writes when it started and finished (ms since the
 * epoch) and how it exited to RUN_PATH, which is committed into the postrun image with the rest.
 * `date +%s%3N` needs GNU date, as the PRD's wrapper does.
 */
export const executionWrapper = (command: string) =>
  [
    "mkdir -p /thunderjar",
    "start=$(date +%s%3N)",
    `sh -c ${shellQuote(command)}`,
    "code=$?",
    "end=$(date +%s%3N)",
    `echo "{\\"startedAt\\":$start,\\"finishedAt\\":$end,\\"exitCode\\":$code}" > ${RUN_PATH}`,
  ].join("\n");

export type ContainerRun = {
  prerunImage: string;
  postrunImage: string;
  /** The harness's `cli` command. */
  command: string;
  /** The container's name. */
  container: string;
};

export type ContainerRunOutcome = {
  execution: Execution;
  /** The text of the harness's result file, or null if it left none. */
  harnessResult: string | null;
};

function parseExecution(text: string | undefined): Execution {
  let parsed: Partial<Execution> | undefined;
  try {
    parsed = text === undefined ? undefined : (JSON.parse(text) as Partial<Execution>);
  } catch {
    parsed = undefined;
  }
  const { startedAt, finishedAt, exitCode } = parsed ?? {};
  if (typeof startedAt !== "number" || typeof finishedAt !== "number" || typeof exitCode !== "number") {
    throw new DockerContainerError(`The execution wrapper left no valid ${RUN_PATH}: ${text === undefined ? "there is none" : text.trim()}`);
  }
  return { startedAt, finishedAt, exitCode };
}

/**
 * Runs `run`, commits its container into its postrun image, even when the agent exits
 * non-zero, and removes the container. Throws a DockerContainerError if Docker fails.
 */
export async function runInContainer(run: ContainerRun): Promise<ContainerRunOutcome> {
  try {
    await runContainer(run.prerunImage, run.container, executionWrapper(run.command));
    const execution = parseExecution(await readContainerFile(run.container, RUN_PATH));
    const harnessResult = (await readContainerFile(run.container, RESULT_PATH)) ?? null;
    await commitContainer(run.container, run.postrunImage, run.prerunImage);
    return { execution, harnessResult };
  } finally {
    await removeContainer(run.container).catch(() => {});
  }
}
