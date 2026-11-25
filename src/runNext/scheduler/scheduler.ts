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
import type { Clock } from "../../services/Clock/Clock.ts";
import type { Manifest, PlannedRun, RunRecord } from "../types.ts";

export type SchedulerSettings = {
  /** How long the first iteration of a permutation gets to write the prompt cache before the rest start. */
  cacheWarmupMs: number;
  /** How often a waiting worker checks whether the upload backlog has cleared. */
  backpressurePollMs: number;
};

export interface Scheduler {
  /** Each run's record, in the manifest's order. Those never started, once asked to stop, are left out. */
  run(manifest: Manifest, task: (run: PlannedRun) => Promise<RunRecord>): Promise<RunRecord[]>;
}

/**
 * - Runs start in the manifest's order, so a permutation's iterations run close together.
 * - A permutation's first run gets `cacheWarmupMs` on its own, or until it finishes if that's
 *   sooner, before its others start. A worker whose next run is waiting on that waits too.
 * - No run starts while `isBackedUp()`, or once `shouldStop()`.
 * - `task` must never throw. If it does, its run is recorded as crashed, and the rest still run.
 */
export function createScheduler(deps: { clock: Clock; isBackedUp: () => boolean; settings: SchedulerSettings; shouldStop?: () => boolean }): Scheduler {
  const { clock, isBackedUp, settings, shouldStop = () => false } = deps;
  return {
    async run(manifest, task) {
      const records: (RunRecord | undefined)[] = manifest.runs.map(() => undefined);
      // Resolves once each permutation's first run has had its warm-up.
      const warmedUp = new Map<string, Promise<void>>();
      let next = 0;
      /** Resolves after the warm-up, or once `ended` does if that's sooner: then its timer is cleared, so nothing waits on it. */
      const warmUp = (ended: Promise<unknown>): Promise<void> => {
        if (settings.cacheWarmupMs <= 0) return Promise.resolve();
        const warm = Promise.withResolvers<void>();
        const timer = clock.setTimeout(() => warm.resolve(), settings.cacheWarmupMs);
        void ended.then(() => {
          clock.clearTimeout(timer);
          warm.resolve();
        });
        return warm.promise;
      };
      const worker = async () => {
        while (next < manifest.runs.length && !shouldStop()) {
          const index = next++;
          const run = manifest.runs[index] as PlannedRun;
          const lead = warmedUp.get(run.permutationHash);
          // In an object: a promise resolved with a promise would wait for it.
          const started = Promise.withResolvers<{ ended: Promise<unknown> }>();
          if (lead === undefined) {
            // The lead: the rest wait for it to start, then for its warm-up or its end.
            warmedUp.set(
              run.permutationHash,
              started.promise.then(({ ended }) => warmUp(ended)),
            );
          } else {
            await lead;
          }
          while (isBackedUp() && !shouldStop()) await clock.sleep(settings.backpressurePollMs);
          if (shouldStop()) {
            started.resolve({ ended: Promise.resolve() });
            break;
          }
          const startedAt = clock.now();
          const running = task(run).catch(
            (error: unknown): RunRecord => ({
              runId: run.runId,
              outcome: "crashed",
              startedAt,
              finishedAt: clock.now(),
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          started.resolve({ ended: running });
          records[index] = await running;
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(manifest.concurrency, manifest.runs.length)) }, worker));
      return records.filter((record): record is RunRecord => record !== undefined);
    },
  };
}
