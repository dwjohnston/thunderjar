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

// Runs each planned run itself, one worker per concurrency slot.
import type { Clock } from "../services/Clock/Clock.ts";
import type { Manifest, PlannedRun, RunRecord } from "./types.ts";

export type SchedulerSettings = {
  /** How long the first iteration of a permutation gets to write the prompt cache before the rest start. */
  cacheWarmupMs: number;
  /** How often a waiting worker checks whether the upload backlog has cleared. */
  backpressurePollMs: number;
};

export interface Scheduler {
  run(manifest: Manifest, task: (run: PlannedRun) => Promise<RunRecord>): Promise<RunRecord[]>;
}

export function createScheduler(_deps: { clock: Clock; isBackedUp: () => boolean; settings: SchedulerSettings }): Scheduler {
  return {
    run: async () => {
      throw new Error("Not implemented: scheduler.run");
    },
  };
}
