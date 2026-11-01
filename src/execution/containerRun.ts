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
 * A shell function, `now_ms`, printing the ms since the epoch. GNU date gives them with
 * `date +%s%3N`; busybox date (Alpine) prints seconds or a literal `%3N`, so anything that isn't
 * 13 digits falls back to whole seconds times 1000.
 */
export const NOW_MS_FUNCTION = [
  "now_ms() {",
  "  ms=$(date +%s%3N)",
  "  case $ms in",
  `    ${"[0-9]".repeat(13)}) echo "$ms" ;;`,
  "    *) echo $(( $(date +%s) * 1000 )) ;;",
  "  esac",
  "}",
].join("\n");

/**
 * The execution wrapper: runs `command` and writes when it started and finished (ms since the
 * epoch) and how it exited to RUN_PATH, which is committed into the postrun image with the rest.
 */
export const executionWrapper = (command: string) =>
  [
    "mkdir -p /thunderjar",
    NOW_MS_FUNCTION,
    "start=$(now_ms)",
    `sh -c ${shellQuote(command)}`,
    "code=$?",
    "end=$(now_ms)",
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

/** Whether `value` is plausibly ms since the epoch: from 2001-09-09 (13 digits) up to 2286. */
const isEpochMs = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1e12 && (value as number) < 1e13;

/** The Execution in the text of RUN_PATH. Throws a DockerContainerError if it isn't a valid one. */
export function parseExecution(text: string | undefined): Execution {
  let parsed: Partial<Execution> | undefined;
  try {
    parsed = text === undefined ? undefined : (JSON.parse(text) as Partial<Execution>);
  } catch {
    parsed = undefined;
  }
  const { startedAt, finishedAt, exitCode } = parsed ?? {};
  if (!isEpochMs(startedAt) || !isEpochMs(finishedAt) || typeof exitCode !== "number") {
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
