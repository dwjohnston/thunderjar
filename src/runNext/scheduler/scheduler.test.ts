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

import { describe, expect, test } from "bun:test";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { plan } from "../plan/plan.ts";
import { config } from "../testing/fixtures.ts";
import type { PlannedRun, RunRecord } from "../types.ts";
import { createScheduler } from "./scheduler.ts";

const manifestOf = (permutationCount: number, iterations: number, concurrency: number) =>
  plan(config({ permutationCount, iterations }), { concurrency, executionId: "01exec" });

/** A task a test finishes by hand: `started` lists the runs started, as `<permutation>.<iteration>`, and `finish` ends one. */
function manualTask() {
  const started: string[] = [];
  const waiting = new Map<string, () => void>();
  const name = (run: PlannedRun) => `${run.permutation}.${run.iteration}`;
  const task = (run: PlannedRun) =>
    new Promise<RunRecord>((resolve) => {
      started.push(name(run));
      waiting.set(name(run), () => resolve({ runId: run.runId, outcome: "completed", startedAt: 0, finishedAt: 0 }));
    });
  return { started, task, finish: (which: string) => waiting.get(which)?.() };
}

const SETTINGS = { cacheWarmupMs: 0, backpressurePollMs: 1_000 };

describe(createScheduler, () => {
  test("runs up to the manifest's concurrency at once, in order, each worker starting its next as it finishes one", async () => {
    const clock = new FakeClock();
    const { started, task, finish } = manualTask();
    const running = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS }).run(manifestOf(4, 1, 2), task);
    await clock.advance(0);
    expect(started).toEqual(["1.1", "2.1"]);

    finish("2.1");
    await clock.advance(0);
    expect(started).toEqual(["1.1", "2.1", "3.1"]);

    for (const which of ["1.1", "3.1"]) finish(which);
    await clock.advance(0);
    finish("4.1");
    expect((await running).map(({ runId }) => runId)).toEqual(["01exec-p1000000-i1", "01exec-p2000000-i1", "01exec-p3000000-i1", "01exec-p4000000-i1"]);
  });

  test("a permutation's first run gets the warm-up on its own before its others start", async () => {
    const clock = new FakeClock();
    const { started, task } = manualTask();
    void createScheduler({ clock, isBackedUp: () => false, settings: { ...SETTINGS, cacheWarmupMs: 5_000 } }).run(manifestOf(1, 3, 3), task);

    await clock.advance(4_999);
    expect(started).toEqual(["1.1"]);

    await clock.advance(1);
    expect(started).toEqual(["1.1", "1.2", "1.3"]);
  });

  test("the warm-up ends early if the first run finishes first", async () => {
    const clock = new FakeClock();
    const { started, task, finish } = manualTask();
    void createScheduler({ clock, isBackedUp: () => false, settings: { ...SETTINGS, cacheWarmupMs: 5_000 } }).run(manifestOf(1, 2, 2), task);
    await clock.advance(100);

    finish("1.1");
    await clock.advance(0);

    expect(started).toEqual(["1.1", "1.2"]);
  });

  test("no run starts while the uploads are backed up", async () => {
    const clock = new FakeClock();
    const { started, task } = manualTask();
    let backedUp = true;
    void createScheduler({ clock, isBackedUp: () => backedUp, settings: SETTINGS }).run(manifestOf(1, 1, 1), task);

    await clock.advance(2_500);
    expect(started).toEqual([]);

    backedUp = false;
    await clock.advance(500);
    expect(started).toEqual(["1.1"]);
  });

  test("once asked to stop, nothing more starts, and the runs never started have no record", async () => {
    const clock = new FakeClock();
    const { started, task, finish } = manualTask();
    let stop = false;
    const running = createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS, shouldStop: () => stop }).run(manifestOf(3, 1, 1), task);
    await clock.advance(0);

    stop = true;
    finish("1.1");

    expect((await running).map(({ runId }) => runId)).toEqual(["01exec-p1000000-i1"]);
    expect(started).toEqual(["1.1"]);
  });

  test("a task that throws, though it mustn't, is a crashed run, and the rest still run", async () => {
    const clock = new FakeClock();
    const task = async (run: PlannedRun): Promise<RunRecord> => {
      if (run.permutation === 1) throw new Error("boom");
      return { runId: run.runId, outcome: "completed", startedAt: 0, finishedAt: 0 };
    };

    const records = await createScheduler({ clock, isBackedUp: () => false, settings: SETTINGS }).run(manifestOf(2, 1, 1), task);

    expect(records.map(({ outcome, error }) => ({ outcome, error }))).toEqual([{ outcome: "crashed", error: "boom" }, { outcome: "completed", error: undefined }]);
  });
});
