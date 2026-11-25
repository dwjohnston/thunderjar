/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { createScheduler, type SchedulerSettings } from "./scheduler.ts";

type Job = { name: string; permutationHash: string };

/** Jobs named after their group, e.g. `jobs("a", "a", "b")` is a1, a2, b1. */
function jobs(...groups: string[]): Job[] {
  const seen = new Map<string, number>();
  return groups.map((group) => {
    const count = (seen.get(group) ?? 0) + 1;
    seen.set(group, count);
    return { name: `${group}${count}`, permutationHash: group };
  });
}

function setup(options: { settings?: Partial<SchedulerSettings>; isBackedUp?: () => boolean; isStopped?: () => boolean } = {}) {
  const clock = new FakeClock();
  const scheduler = createScheduler({
    clock,
    isBackedUp: options.isBackedUp ?? (() => false),
    isStopped: options.isStopped,
    settings: { cacheWarmupMs: 0, backpressurePollMs: 100, ...options.settings },
  });
  /** When each job started, by name. */
  const started: Record<string, number> = {};
  /** A task that takes as long as `durations` says (default 1000ms), and returns the job's name in capitals. */
  const taskTaking = (durations: Record<string, number> = {}) => async (job: Job) => {
    started[job.name] = clock.now();
    await clock.sleep(durations[job.name] ?? 1000);
    return job.name.toUpperCase();
  };
  return { clock, scheduler, started, taskTaking };
}

describe(createScheduler, () => {
  test("starts jobs in order, never more at once than the concurrency", async () => {
    const { clock, scheduler } = setup();
    const order: string[] = [];
    let running = 0;
    let most = 0;

    const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "b", "c", "d", "e") }, async (job) => {
      order.push(job.name);
      most = Math.max(most, ++running);
      await clock.sleep(1000);
      running--;
    });
    await clock.advance(10_000);
    await promise;

    expect(order).toEqual(["a1", "b1", "c1", "d1", "e1"]);
    expect(most).toBe(2);
  });

  test("a worker starts its next job only when its current one finishes", async () => {
    const { clock, scheduler, started, taskTaking } = setup();

    const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "b", "c", "d") }, taskTaking({ a1: 300, b1: 1000, c1: 300 }));
    await clock.advance(5000);
    await promise;

    expect(started).toEqual({ a1: 0, b1: 0, c1: 300, d1: 600 });
  });

  test("returns results in the manifest's order, not the order they finished in", async () => {
    const { clock, scheduler, taskTaking } = setup();

    const promise = scheduler.run({ concurrency: 3, runs: jobs("a", "b", "c") }, taskTaking({ a1: 900, b1: 100, c1: 500 }));
    await clock.advance(1000);

    expect(await promise).toEqual(["A1", "B1", "C1"]);
  });

  test("with no jobs, resolves with nothing", async () => {
    const { scheduler, taskTaking } = setup();

    expect(await scheduler.run({ concurrency: 4, runs: [] }, taskTaking())).toEqual([]);
  });

  describe("warm-up", () => {
    test("later jobs of a group wait for the warm-up time after the first one started", async () => {
      const { clock, scheduler, started, taskTaking } = setup({ settings: { cacheWarmupMs: 5000 } });

      const promise = scheduler.run({ concurrency: 3, runs: jobs("a", "a", "a") }, taskTaking({ a1: 60_000 }));
      await clock.advance(4999);
      expect(started).toEqual({ a1: 0 });

      await clock.advance(1);
      expect(started).toEqual({ a1: 0, a2: 5000, a3: 5000 });

      await clock.advance(60_000);
      expect(await promise).toEqual(["A1", "A2", "A3"]);
    });

    test("they start sooner when the first one finishes sooner", async () => {
      const { clock, scheduler, started, taskTaking } = setup({ settings: { cacheWarmupMs: 5000 } });

      const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "a") }, taskTaking({ a1: 2000 }));
      await clock.advance(10_000);
      await promise;

      expect(started).toEqual({ a1: 0, a2: 2000 });
    });

    test("a job after the warm-up time doesn't wait", async () => {
      const { clock, scheduler, started, taskTaking } = setup({ settings: { cacheWarmupMs: 5000 } });

      const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "b", "a") }, taskTaking({ a1: 60_000, b1: 7000 }));
      await clock.advance(60_000);
      await promise;

      expect(started).toEqual({ a1: 0, b1: 0, a2: 7000 });
    });

    test("different groups don't delay each other", async () => {
      const { clock, scheduler, started, taskTaking } = setup({ settings: { cacheWarmupMs: 5000 } });

      const promise = scheduler.run({ concurrency: 3, runs: jobs("a", "a", "b") }, taskTaking({ a1: 60_000 }));
      await clock.advance(0);
      expect(started).toEqual({ a1: 0, b1: 0 });

      await clock.advance(60_000);
      expect(await promise).toEqual(["A1", "A2", "B1"]);
    });

    test("with a warm-up time of 0, nothing waits", async () => {
      const { clock, scheduler, started, taskTaking } = setup({ settings: { cacheWarmupMs: 0 } });

      const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "a") }, taskTaking());
      await clock.advance(1000);
      await promise;

      expect(started).toEqual({ a1: 0, a2: 0 });
    });

    test("with a concurrency of 1, nothing waits", async () => {
      const { clock, scheduler, started, taskTaking } = setup({ settings: { cacheWarmupMs: 5000 } });

      const promise = scheduler.run({ concurrency: 1, runs: jobs("a", "a") }, taskTaking({ a1: 100 }));
      await clock.advance(2000);
      await promise;

      expect(started).toEqual({ a1: 0, a2: 100 });
    });
  });

  test("while backed up, checks again each poll, and starts nothing", async () => {
    let backedUp = true;
    let checks = 0;
    const { clock, scheduler, started, taskTaking } = setup({
      settings: { backpressurePollMs: 100 },
      isBackedUp: () => {
        checks++;
        return backedUp;
      },
    });

    const promise = scheduler.run({ concurrency: 1, runs: jobs("a", "b") }, taskTaking({ a1: 50, b1: 50 }));
    await clock.advance(250);
    expect(started).toEqual({});
    expect(checks).toBe(3);

    backedUp = false;
    await clock.advance(50);
    expect(started).toEqual({ a1: 300 });

    await clock.advance(1000);
    expect(await promise).toEqual(["A1", "B1"]);
  });

  describe("stop", () => {
    test("once stopped, no more jobs start, and the result has only the ones that ran", async () => {
      let stopped = false;
      const { clock, scheduler, started, taskTaking } = setup({ isStopped: () => stopped });

      const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "b", "c", "d") }, taskTaking());
      await clock.advance(500);
      stopped = true;
      await clock.advance(5000);

      expect(await promise).toEqual(["A1", "B1"]);
      expect(Object.keys(started)).toEqual(["a1", "b1"]);
    });

    test("stopped from the start, runs nothing", async () => {
      const { scheduler, started, taskTaking } = setup({ isStopped: () => true });

      expect(await scheduler.run({ concurrency: 2, runs: jobs("a", "b") }, taskTaking())).toEqual([]);
      expect(started).toEqual({});
    });

    test("a job waiting on backpressure doesn't start once stopped", async () => {
      let stopped = false;
      const { clock, scheduler, started, taskTaking } = setup({ isBackedUp: () => true, isStopped: () => stopped });

      const promise = scheduler.run({ concurrency: 1, runs: jobs("a") }, taskTaking());
      await clock.advance(150);
      expect(peek.status(promise)).toBe("pending");

      stopped = true;
      await clock.advance(100);

      expect(await promise).toEqual([]);
      expect(started).toEqual({});
    });

    test("a job waiting on warm-up doesn't start once stopped", async () => {
      let stopped = false;
      const { clock, scheduler, taskTaking } = setup({ settings: { cacheWarmupMs: 5000 }, isStopped: () => stopped });

      const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "a") }, taskTaking({ a1: 8000 }));
      await clock.advance(1000);
      stopped = true;
      await clock.advance(10_000);

      expect(await promise).toEqual(["A1"]);
    });
  });

  test("when a task throws, running jobs finish, no more start, and the first error is rethrown", async () => {
    const { clock, scheduler } = setup();
    const finished: string[] = [];

    const promise = scheduler.run({ concurrency: 2, runs: jobs("a", "b", "c", "d") }, async (job) => {
      await clock.sleep(job.name === "a1" ? 100 : 1000);
      if (job.name === "a1") throw new Error("a1 broke");
      finished.push(job.name);
    });
    // Watched from the start, so the rejection is never unhandled.
    const outcome = promise.then(
      () => "resolved",
      (error: unknown) => error,
    );
    await clock.advance(500);
    expect(peek.status(promise)).toBe("pending");

    await clock.advance(5000);

    expect(await outcome).toEqual(new Error("a1 broke"));
    expect(finished).toEqual(["b1"]);
  });
});
