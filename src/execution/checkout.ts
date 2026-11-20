/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Checking out a past container run: its end state, from its postrun image, as a local branch, or
// a shell in that image.
import { abbreviateHash } from "../config/permutations.ts";
import type { ContainerRunRecord } from "../store/runDataStore.ts";

/** A container run's iteration as its ID gives it: counting from 0, two digits at least, e.g. `i00`. */
const iterationIndex = (iteration: number) => `i${String(iteration - 1).padStart(2, "0")}`;

/** A container run within its execution: its permutation's abbreviated hash and its iteration, e.g. `h4f9a21c8-i00`. */
const runInExecution = ({ permutationHash, iteration }: Pick<ContainerRunRecord, "permutationHash" | "iteration">) =>
  `h${abbreviateHash(permutationHash)}-${iterationIndex(iteration)}`;

/** A container run's ID, e.g. `01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00`. */
export const containerRunId = (record: Pick<ContainerRunRecord, "executionId" | "permutationHash" | "iteration">) =>
  `${record.executionId}-${runInExecution(record)}`;

/** A container run's ID, split into its execution's ID and the run within it, or undefined if it isn't one. */
export function parseContainerRunId(id: string): { executionId: string; hash: string; iteration: number } | undefined {
  const match = /^(.+)-h([0-9a-f]{8})-i(\d{2,})$/.exec(id);
  if (!match) return undefined;
  return { executionId: match[1]!, hash: match[2]!, iteration: Number(match[3]) + 1 };
}

/** The container run of `runs` that `id` names, or undefined if none. */
export function findContainerRun(runs: ContainerRunRecord[], id: string): ContainerRunRecord | undefined {
  return runs.find((run) => containerRunId(run) === id);
}

/**
 * The branch a container run is checked out to: `thunderjar/run/<test case>/<execution>/<run>`.
 * `run/` is the kind of branch, as `capture/` is of `thunderjar/capture/<session>`.
 */
export const runBranch = (record: ContainerRunRecord) => `thunderjar/run/${record.testCase}/${record.executionId}/${runInExecution(record)}`;

/** Why `record` can't be checked out, or undefined if it can. */
export function unavailableReason(record: ContainerRunRecord): string | undefined {
  if (record.execution.failedToStart !== undefined) return "it never started";
  if (record.postrunPurge !== undefined) return "its postrun image was purged";
  return undefined;
}
