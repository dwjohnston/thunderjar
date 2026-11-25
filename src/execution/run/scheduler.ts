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

// The scheduler: runs a list of runs through a task, a fixed number at once. It awaits each task
// itself, so it knows a slot is free without being told.
import type { Clock } from "../../services/Clock/Clock.ts";
import { moduleLogger } from "../../log/logger.ts";

const log = moduleLogger("scheduler");

export type SchedulerSettings = {
  /** How long a permutation's first run has to itself, to write the prompt cache the others read. */
  cacheWarmupMs: number;
  /** How often a worker held back by `isBackedUp` looks again. */
  backpressurePollMs: number;
};

export type SchedulerOptions = {
  clock: Pick<Clock, "sleep" | "setTimeout" | "clearTimeout">;
  /** Whether new runs should hold off, e.g. too many committed images are waiting to upload. */
  isBackedUp: () => boolean;
  /** Once true, no new run starts. */
  shouldStop?: () => boolean;
  settings: SchedulerSettings;
};

export interface Scheduler {
  /**
   * `task` of every run, at most `work.concurrency` at once, each result at its run's place.
   * A run that never started, because `shouldStop` said so, gets `onSkipped`'s. `task` must
   * never throw.
   */
  run<R extends { permutationHash: string }, T>(
    work: { concurrency: number; runs: R[] },
    task: (run: R) => Promise<T>,
    onSkipped: (run: R) => T,
  ): Promise<T[]>;
}

export function createScheduler({ clock, isBackedUp, shouldStop, settings }: SchedulerOptions): Scheduler {
  return {
    async run<R extends { permutationHash: string }, T>(
      work: { concurrency: number; runs: R[] },
      task: (run: R) => Promise<T>,
      onSkipped: (run: R) => T,
    ): Promise<T[]> {
      const { runs } = work;
      const results: T[] = Array.from({ length: runs.length });
      // Each permutation's warm-up: resolved once its first run has had its time, or ended.
      const warmups = new Map<string, Warmup>();
      let next = 0;
      let failure: { error: unknown } | undefined;

      const halted = () => failure !== undefined || shouldStop?.() === true;

      const worker = async (): Promise<void> => {
        while (next < runs.length) {
          const index = next++;
          const run = runs[index] as R;

          // Taken in order, so whoever takes a permutation's first run is the one that warms it up.
          const existing = warmups.get(run.permutationHash);
          const warmup = existing ?? newWarmup();
          const first = existing === undefined;
          if (first) warmups.set(run.permutationHash, warmup);
          else await warmup.done;

          while (!halted() && isBackedUp()) await clock.sleep(settings.backpressurePollMs);

          if (halted()) {
            if (first) warmup.finish();
            results[index] = onSkipped(run);
            continue;
          }

          const timer = first ? clock.setTimeout(warmup.finish, settings.cacheWarmupMs) : undefined;
          try {
            results[index] = await task(run);
          } catch (error) {
            // A task is meant to turn its own failures into a result. One that throws anyway
            // mustn't leave the other workers running containers nobody is waiting for.
            log.error({ err: error }, "A scheduled task threw. No new run will start.");
            failure ??= { error };
          } finally {
            clock.clearTimeout(timer);
            // The first run ended before its time was up: nothing left to wait for.
            if (first) warmup.finish();
          }
        }
      };

      const workers = Math.max(1, Math.min(Math.floor(work.concurrency), runs.length));
      await Promise.all(Array.from({ length: workers }, worker));
      if (failure !== undefined) throw failure.error;
      return results;
    },
  };
}

type Warmup = { done: Promise<void>; finish: () => void };

function newWarmup(): Warmup {
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { done, finish };
}
