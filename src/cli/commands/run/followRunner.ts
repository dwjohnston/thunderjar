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

// Following an execution that runs on the runtime, in a runner, for `run` and `attach`: its
// events are turned into the hooks that write the execution's lines, and its last gives its
// records, or the error it stopped on.
import { errorOf, replayEvent, RunnerError, type RunnerEvent } from "../../../execution/runnerEvents.ts";
import { followRunner, removeRunner, RunnerLostError, runnerLog, RunnerUnreachableError } from "../../../execution/onRuntime.ts";
import type { RunHooks } from "../../../execution/runExecution.ts";
import type { PlanData, SubmissionSummary } from "../../../execution/runnerSpec.ts";
import type { ExecutionTimings } from "../../../execution/timings.ts";
import type { ContainerRunRecord, ExecutionRecord } from "../../../store/runDataStore.ts";
import { loadProjectConfig } from "../../../config/projectConfig.ts";
import { openStore } from "../../dataDir.ts";
import { printError as error } from "../../output.ts";

/** An execution that has ended: its record, where it's recorded, and its container runs' records, if they were asked for. */
export type Executed = { execution: ExecutionRecord; recordedIn: string; containerRuns: ContainerRunRecord[] };

/** What's written when `run` or `attach` is interrupted while it follows an execution on the runtime. */
export const detachedMessage = (signal: string, executionId: string) =>
  `Detached (${signal}): execution ${executionId} carries on, on the runtime.\nFollow it again with \`thunderjar attach ${executionId}\`, or stop it with \`thunderjar attach ${executionId} --stop\`.`;

/**
 * Follows execution `executionId`'s runner, on the runtime `command` reaches, to its end. `shown`
 * is given the execution, once the runner has said what it is, and returns the hooks that show
 * it. Once it ends, the runner's log is kept in `root`'s logs, its container removed, and, with
 * a SQLite run data store, its records written to the project's own file. Throws
 * the error the runner stopped on, a RunnerLostError, or a RunnerUnreachableError. If `signal`
 * aborts, never returns: whoever aborted it ends the process.
 */
export async function followToEnd(
  command: string[],
  executionId: string,
  imagePrefix: string | undefined,
  root: string,
  shown: (submission: SubmissionSummary) => { hooks: RunHooks; plan: PlanData },
  signal?: AbortSignal,
): Promise<Executed> {
  let showing: { hooks: RunHooks; plan: PlanData } | undefined;
  let last: Extract<RunnerEvent, { event: "finished" | "failed" }> | undefined;
  const outcome = await followRunner(
    command,
    executionId,
    imagePrefix,
    (event) => {
      if (event.event === "started") showing = shown(event.submission);
      if (event.event === "finished" || event.event === "failed") last = event;
      if (showing !== undefined) replayEvent(event, showing.hooks, showing.plan);
    },
    signal,
  );
  if (outcome === "detached" || last === undefined) return await new Promise<never>(() => {});
  // Its log goes with its container: kept here, beside this command's own.
  const log = await runnerLog(command, executionId, imagePrefix);
  if (log !== undefined) await Bun.write(`${root}/logs/${executionId}-runner.log`, log).catch(() => {});
  await removeRunner(command, executionId, imagePrefix);
  if (last.event === "failed") throw errorOf(last.failure);
  return keepRecords(root, { execution: last.execution, recordedIn: last.recordedIn, containerRuns: last.containerRuns });
}

/**
 * With a SQLite run data store, a runner records in a file of its own, in its container, which
 * goes with it: so what it recorded is written to the project's own file here, where `show` and
 * `executions` read it. With Postgres, the runner wrote the one database, and nothing is done.
 */
async function keepRecords(root: string, executed: Executed): Promise<Executed> {
  const { runDataStore } = await loadProjectConfig(root);
  if (runDataStore.kind !== "sqlite") return executed;
  const { store, where } = await openStore(root, undefined, root);
  await store.recordExecution(executed.execution);
  for (const run of executed.containerRuns) await store.recordContainerRun(run);
  return { ...executed, recordedIn: where };
}

/**
 * Writes why following a runner stopped, if `caught` is an error of the runner's, or of following
 * it. False for any other error, with nothing written.
 */
export function reportRunnerFailure(caught: unknown, executionId: string): boolean {
  if (caught instanceof RunnerUnreachableError) {
    error(`${caught.message}\nExecution ${executionId} may still be running there. Follow it again with \`thunderjar attach ${executionId}\`.`);
  } else if (caught instanceof RunnerLostError) {
    error(caught.message);
  } else if (caught instanceof RunnerError) {
    error(`The runner on the runtime stopped: ${caught.message}`);
  } else {
    return false;
  }
  return true;
}

/**
 * How long each phase took: `here`, what this process timed, and with a runner, what it timed
 * too, `there`. The whole is this process's. Undefined if nothing was timed.
 */
export function mergeTimings(here: ExecutionTimings, there: ExecutionTimings | undefined, withRunner: boolean): ExecutionTimings | undefined {
  if (!withRunner) return there;
  if (there === undefined && Object.keys(here.phases).length === 0) return undefined;
  return { wallMs: here.wallMs, phases: { ...here.phases, ...there?.phases } };
}
