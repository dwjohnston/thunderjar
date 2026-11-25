/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Reading what the timed run (../runScript.ts) left in RUN_PATH: when the agent started and
// finished, and how it exited.
import { DockerContainerError } from "../../services/Docker/errors.ts";
import type { Execution } from "../../store/runDataStore.ts";
import { RUN_PATH } from "../runScript.ts";

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
  // The times are wall-clock times, so a clock stepped back mid-run, e.g. by time sync on a VM
  // that has just booted, can put the finish before the start. A run never takes less than nothing.
  const notBeforeStart = (at: number) => Math.max(at, startedAt);
  if (killedAt !== undefined) return { startedAt, finishedAt: notBeforeStart(killedAt), exitCode: null, timedOut: true, timeoutSeconds };
  if (!isEpochMs(finishedAt) || typeof exitCode !== "number") throw invalid();
  if (turns !== undefined && (!Array.isArray(turns) || !turns.every(isTurn))) throw invalid();
  return { startedAt, finishedAt: notBeforeStart(finishedAt), exitCode, timedOut: false, timeoutSeconds, ...(turns && { turns }) };
}
