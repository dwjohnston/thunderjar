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

export type SchedulerSettings = {
  /** How long the first iteration of a permutation gets to write the prompt cache before the rest start. */
  cacheWarmupMs: number;
  /** How often a waiting worker checks whether the upload backlog has cleared. */
  backpressurePollMs: number;
};

export interface Scheduler {
  /**
   * Runs `task` for each run, at most `concurrency` at once, and resolves with the results of the
   * runs that ran, in the manifest's order. `task` should never throw: if one does, no new runs
   * start, the running ones finish, and the first error is rethrown.
   */
  run<R extends { permutationHash: string }, T>(
    manifest: { concurrency: number; runs: readonly R[] },
    task: (run: R) => Promise<T>,
  ): Promise<T[]>;
}

/** The first run started for a permutation: it writes the prompt cache the later ones read. */
type Warmer = { startedAt: number; finished: boolean; done: Promise<void> };

export function createScheduler(deps: {
  clock: Clock;
  /** True while new runs should hold off, e.g. too many committed images are waiting to push. */
  isBackedUp: () => boolean;
  /** True once no more runs should start. */
  isStopped?: () => boolean;
  settings: SchedulerSettings;
}): Scheduler {
  const { clock, isBackedUp, isStopped, settings } = deps;

  /** Resolves when the warmer finishes or its warm-up time is over, whichever is first. */
  function warmUp(warmer: Warmer, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = clock.setTimeout(resolve, ms);
      void warmer.done.then(() => {
        clock.clearTimeout(timer);
        resolve();
      });
    });
  }

  return {
    async run<R extends { permutationHash: string }, T>(
      manifest: { concurrency: number; runs: readonly R[] },
      task: (run: R) => Promise<T>,
    ): Promise<T[]> {
      const { runs } = manifest;
      const results: ({ value: T } | undefined)[] = runs.map(() => undefined);
      const warmers = new Map<string, Warmer>();
      const errors: unknown[] = [];
      let next = 0;

      const halted = () => errors.length > 0 || isStopped?.() === true;

      /**
       * Waits until `run` may start, then resolves with what to call when it finishes.
       * Resolves with undefined when it must not start at all.
       */
      async function waitToStart(run: R): Promise<(() => void) | undefined> {
        for (;;) {
          if (halted()) return undefined;
          if (isBackedUp()) {
            await clock.sleep(settings.backpressurePollMs);
            continue;
          }
          const warmer = warmers.get(run.permutationHash);
          if (warmer === undefined) {
            // Registered before anything is awaited, so two workers can't both become the warmer.
            const finished = Promise.withResolvers<void>();
            const mine: Warmer = { startedAt: clock.now(), finished: false, done: finished.promise };
            warmers.set(run.permutationHash, mine);
            return () => {
              mine.finished = true;
              finished.resolve();
            };
          }
          const remaining = warmer.finished ? 0 : warmer.startedAt + settings.cacheWarmupMs - clock.now();
          if (remaining <= 0) return () => {};
          await warmUp(warmer, remaining);
        }
      }

      async function worker(): Promise<void> {
        while (next < runs.length && !halted()) {
          const index = next++;
          const run = runs[index] as R;
          const finish = await waitToStart(run);
          if (finish === undefined) return;
          try {
            results[index] = { value: await task(run) };
          } catch (error) {
            errors.push(error);
          } finally {
            finish();
          }
        }
      }

      const workers = Math.max(0, Math.min(Math.floor(manifest.concurrency), runs.length));
      await Promise.all(Array.from({ length: workers }, () => worker()));

      if (errors.length > 0) throw errors[0];
      return results.flatMap((result) => (result === undefined ? [] : [result.value]));
    },
  };
}
