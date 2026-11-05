import type { Execution } from "../store/runDataStore.ts";

/**
 * How a container run's agent ended, without how long it took: `done`, `exited 1`, `timed out
 * after 5s`, with `, no result file` if it finished but left none.
 */
export function agentEnd(execution: Execution, harnessResult: string | null): string {
  if (execution.timedOut) return `timed out after ${execution.timeoutSeconds}s`;
  const ended = execution.exitCode === 0 ? "done" : `exited ${execution.exitCode}`;
  return harnessResult === null ? `${ended}, no result file` : ended;
}

/** Whether a container run's agent exited 0 in time, and left a result file. */
export const endedCleanly = (execution: Execution, harnessResult: string | null) =>
  !execution.timedOut && execution.exitCode === 0 && harnessResult !== null;

/** `n` and `noun`, plural unless `n` is 1, e.g. `2 permutations`. */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** `iso` in UTC, to the minute, e.g. `2026-10-01 10:12`. */
export const minute = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");
