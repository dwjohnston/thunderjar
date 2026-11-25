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

import { describe, expect, it } from "bun:test";
import { peek } from "bun";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { createScheduler } from "./scheduler.ts";

// The examples are print jobs: jobs for the same customer share a `permutationHash`.
type Job = { name: string; permutationHash: string };

const job = (name: string, customer = name): Job => ({ name, permutationHash: customer });

/** A shop that records when each job starts and ends, and how many ran at once. */
function aShop(clock: FakeClock, durations: Record<string, number> = {}, defaultMs = 1_000) {
  const started: Record<string, number> = {};
  const finished: Record<string, number> = {};
  let running = 0;
  let most = 0;
  return {
    started,
    finished,
    most: () => most,
    print: async (work: Job): Promise<string> => {
      started[work.name] = clock.now();
      running++;
      most = Math.max(most, running);
      await clock.sleep(durations[work.name] ?? defaultMs);
      running--;
      finished[work.name] = clock.now();
      return `printed ${work.name}`;
    },
  };
}

const skipped = (work: Job) => `skipped ${work.name}`;

const SETTINGS = { cacheWarmupMs: 5_000, backpressurePollMs: 1_000 };

describe("createScheduler", () => {
  it("gives each job's result, in the jobs' order", async () => {
    const clock = new FakeClock();
    const shop = aShop(clock, { a: 3_000, b: 1_000, c: 2_000 });
    const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

    const done = scheduler.run({ concurrency: 3, runs: [job("a"), job("b"), job("c")] }, shop.print, skipped);
    await clock.advance(3_000);

    expect(await done).toEqual(["printed a", "printed b", "printed c"]);
  });

  it("gives nothing for no jobs", async () => {
    const scheduler = createScheduler({ clock: new FakeClock(), isBackedUp: () => false, settings: SETTINGS });

    expect(await scheduler.run({ concurrency: 2, runs: [] as Job[] }, async () => "never", skipped)).toEqual([]);
  });

  it("runs one at a time with one slot, each starting when the one before ends", async () => {
    const clock = new FakeClock();
    const shop = aShop(clock);
    const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

    const done = scheduler.run({ concurrency: 1, runs: [job("a"), job("b"), job("c")] }, shop.print, skipped);
    await clock.advance(3_000);
    await done;

    expect(shop.started).toEqual({ a: 0, b: 1_000, c: 2_000 });
    expect(shop.most()).toBe(1);
  });

  it("never runs more at once than there are slots", async () => {
    const clock = new FakeClock();
    const shop = aShop(clock);
    const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

    const done = scheduler.run({ concurrency: 2, runs: [job("a"), job("b"), job("c"), job("d"), job("e")] }, shop.print, skipped);
    await clock.advance(3_000);
    await done;

    expect(shop.most()).toBe(2);
    expect(shop.started).toEqual({ a: 0, b: 0, c: 1_000, d: 1_000, e: 2_000 });
  });

  it("starts a slot's next job as soon as its own job ends, whatever the other slots are doing", async () => {
    const clock = new FakeClock();
    const shop = aShop(clock, { a: 10_000, b: 1_000, c: 1_000 });
    const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

    const done = scheduler.run({ concurrency: 2, runs: [job("a"), job("b"), job("c")] }, shop.print, skipped);
    await clock.advance(10_000);
    await done;

    expect(shop.started).toEqual({ a: 0, b: 0, c: 1_000 });
  });

  describe("warm-up", () => {
    it("gives a customer's first job the warm-up time before starting their others", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock, {}, 20_000);
      const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

      const done = scheduler.run({ concurrency: 3, runs: [job("ann-1", "ann"), job("ann-2", "ann"), job("ann-3", "ann")] }, shop.print, skipped);
      await clock.advance(4_999);
      expect(shop.started).toEqual({ "ann-1": 0 });

      await clock.advance(1);
      expect(shop.started).toEqual({ "ann-1": 0, "ann-2": 5_000, "ann-3": 5_000 });

      await clock.advance(20_000);
      await done;
    });

    it("starts the others at once if the first ends sooner", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock, { "ann-1": 2_000 });
      const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

      const done = scheduler.run({ concurrency: 2, runs: [job("ann-1", "ann"), job("ann-2", "ann"), job("ann-3", "ann")] }, shop.print, skipped);
      await clock.advance(3_000);
      await done;

      expect(shop.started).toEqual({ "ann-1": 0, "ann-2": 2_000, "ann-3": 2_000 });
      expect(clock.now()).toBe(3_000);
    });

    it("warms each customer up separately", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock, {}, 20_000);
      const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

      const runs = [job("ann-1", "ann"), job("ann-2", "ann"), job("bob-1", "bob"), job("bob-2", "bob")];
      const done = scheduler.run({ concurrency: 4, runs }, shop.print, skipped);
      await clock.advance(5_000);

      expect(shop.started).toEqual({ "ann-1": 0, "bob-1": 0, "ann-2": 5_000, "bob-2": 5_000 });
      await clock.advance(20_000);
      await done;
    });

    it("has a waiting slot wait, not skip ahead to another customer's job", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock, {}, 20_000);
      const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

      const runs = [job("ann-1", "ann"), job("ann-2", "ann"), job("bob-1", "bob")];
      const done = scheduler.run({ concurrency: 2, runs }, shop.print, skipped);
      await clock.advance(4_000);

      expect(shop.started).toEqual({ "ann-1": 0 });
      await clock.advance(1_000);
      expect(shop.started).toEqual({ "ann-1": 0, "ann-2": 5_000 });
      await clock.advance(40_000);
      await done;
      expect(shop.started["bob-1"]).toBe(20_000);
    });

    it("doesn't wait again for a customer already warmed up", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock, {}, 6_000);
      const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });

      const done = scheduler.run({ concurrency: 1, runs: [job("ann-1", "ann"), job("ann-2", "ann"), job("ann-3", "ann")] }, shop.print, skipped);
      await clock.advance(18_000);
      await done;

      expect(shop.started).toEqual({ "ann-1": 0, "ann-2": 6_000, "ann-3": 12_000 });
    });
  });

  describe("backpressure", () => {
    it("holds every start while backed up, checking again each poll", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock);
      let checks = 0;
      const scheduler = createScheduler({
        clock,
        isBackedUp: () => {
          checks++;
          return clock.now() < 2_500;
        },
        settings: SETTINGS,
      });

      const done = scheduler.run({ concurrency: 1, runs: [job("a")] }, shop.print, skipped);
      await clock.advance(2_999);
      expect(shop.started).toEqual({});

      await clock.advance(1);
      expect(shop.started).toEqual({ a: 3_000 });
      expect(checks).toBe(4);

      await clock.advance(1_000);
      await done;
    });

    it("lets running jobs finish while holding the next", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock);
      let backedUp = false;
      const scheduler = createScheduler({ clock, isBackedUp: () => backedUp, settings: SETTINGS });

      const done = scheduler.run({ concurrency: 1, runs: [job("a"), job("b")] }, shop.print, skipped);
      await clock.advance(500);
      backedUp = true;
      await clock.advance(3_000);
      expect(shop.finished).toEqual({ a: 1_000 });
      expect(shop.started).toEqual({ a: 0 });

      backedUp = false;
      await clock.advance(2_000);
      await done;
      expect(shop.started.b).toBe(4_000);
    });
  });

  describe("stopping", () => {
    it("starts no new job, and skips every job not started", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock);
      let stop = false;
      const scheduler = createScheduler({ clock, isBackedUp: () => false, shouldStop: () => stop, settings: SETTINGS });

      const done = scheduler.run({ concurrency: 2, runs: [job("a"), job("b"), job("c"), job("d")] }, shop.print, skipped);
      await clock.advance(500);
      stop = true;
      await clock.advance(500);

      expect(await done).toEqual(["printed a", "printed b", "skipped c", "skipped d"]);
      expect(shop.started).toEqual({ a: 0, b: 0 });
    });

    it("skips a job that was waiting for a warm-up", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock, {}, 8_000);
      let stop = false;
      const scheduler = createScheduler({ clock, isBackedUp: () => false, shouldStop: () => stop, settings: SETTINGS });

      const done = scheduler.run({ concurrency: 2, runs: [job("ann-1", "ann"), job("ann-2", "ann")] }, shop.print, skipped);
      await clock.advance(1_000);
      stop = true;
      await clock.advance(7_000);

      expect(await done).toEqual(["printed ann-1", "skipped ann-2"]);
    });

    it("stops waiting on a backlog", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock);
      let stop = false;
      const scheduler = createScheduler({ clock, isBackedUp: () => true, shouldStop: () => stop, settings: SETTINGS });

      const done = scheduler.run({ concurrency: 1, runs: [job("a"), job("b")] }, shop.print, skipped);
      await clock.advance(1_500);
      expect(peek.status(done)).toBe("pending");
      stop = true;
      await clock.advance(500);

      expect(await done).toEqual(["skipped a", "skipped b"]);
    });

    it("skips everything if it's already stopped", async () => {
      const scheduler = createScheduler({ clock: new FakeClock(), isBackedUp: () => false, shouldStop: () => true, settings: SETTINGS });

      expect(await scheduler.run({ concurrency: 2, runs: [job("a"), job("b")] }, async () => "never", skipped)).toEqual(["skipped a", "skipped b"]);
    });
  });

  describe("a task that throws, though it never should", () => {
    it("lets the jobs under way finish, starts no more, then rethrows", async () => {
      const clock = new FakeClock();
      const shop = aShop(clock, { b: 3_000 });
      const scheduler = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS });
      const print = async (work: Job) => {
        if (work.name === "a") throw new Error("paper jam");
        return shop.print(work);
      };

      const done = scheduler.run({ concurrency: 2, runs: [job("a"), job("b"), job("c")] }, print, skipped);
      done.catch(() => {});
      await clock.advance(2_999);
      expect(peek.status(done)).toBe("pending");

      await clock.advance(1);
      expect(done).rejects.toThrow("paper jam");
      expect(shop.finished).toEqual({ b: 3_000 });
      expect(shop.started).toEqual({ b: 0 });
    });
  });
});
