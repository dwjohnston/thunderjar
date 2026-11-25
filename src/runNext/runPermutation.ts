/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// One run: start → secrets → agent → wait → commit, then measure and upload in parallel.
import type { Dependencies, PlannedRun, RunRecord } from "./types.ts";
import type { UploadQueue } from "./uploadQueue.ts";

/** Must never throw: a crash or timeout comes back as a `RunRecord` with that outcome. */
export async function runPermutation(
  _run: PlannedRun,
  _deps: Pick<Dependencies, "runtimeDocker" | "runStore" | "env" | "clock" | "state">,
  _uploads: UploadQueue,
): Promise<RunRecord> {
  throw new Error("Not implemented: runPermutation");
}
