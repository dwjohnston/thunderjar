/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { describe, expect, test } from "bun:test";
import { type ExecutionRecord, type RunDataStore, RunDataStoreError } from "../store/runDataStore.ts";
import { executionRecorder } from "./runExecution.ts";

const ISO = expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

const PLAN = { executionId: "01kfa1bgz0aaaaaaaaaaaaaaaa", testCase: "example", task: "is-prime", matrix: { shape: [1, 1, 1, 1, 1], permutations: 1, iterations: 2 } };

/** A store that keeps every execution record written, in order, and fails a write once `failing` is set. */
function memoryStore() {
  const written: ExecutionRecord[] = [];
  const state = { failing: false };
  const store: RunDataStore = {
    async recordExecution(record) {
      await Bun.sleep(1);
      if (state.failing) throw new RunDataStoreError("memory", "unreachable");
      written.push(record);
    },
    async recordContainerRun() {},
    async listExecutions() {
      return [];
    },
    async containerRunsOf() {
      return [];
    },
    async check() {},
  };
  return { store, written, state };
}

describe("executionRecorder", () => {
  test("records the execution as running, in its first phase, as it starts", async () => {
    const { store, written } = memoryStore();

    await executionRecorder(store, PLAN, "beforeExecution");

    expect(written).toEqual([{ ...PLAN, startedAt: ISO, status: "running", phase: "beforeExecution" }]);
  });

  test("records each phase it gets to, once, then how it ended", async () => {
    const { store, written } = memoryStore();
    const recorder = await executionRecorder(store, PLAN, "beforeExecution");

    await recorder.enter("images");
    await Promise.all([recorder.enter("runs"), recorder.enter("runs")]);
    const finished = await recorder.finish("complete");

    expect(written.map(({ status, phase }) => [status, phase])).toEqual([
      ["running", "beforeExecution"],
      ["running", "images"],
      ["running", "runs"],
      ["complete", "runs"],
    ]);
    expect(finished).toEqual({ ...PLAN, startedAt: written[0]!.startedAt, finishedAt: ISO, status: "complete", phase: "runs" });
  });

  test("a failure is recorded with what it was doing and why, in the phase it got to", async () => {
    const { store, written } = memoryStore();
    const recorder = await executionRecorder(store, PLAN, "images");

    await recorder.fail("build", "Building thunderjar-prerun:32a1d048 failed: exit code: 1");

    expect(written.at(-1)).toEqual({
      ...PLAN,
      startedAt: ISO,
      finishedAt: ISO,
      status: "failed",
      phase: "images",
      failure: { step: "build", reason: "Building thunderjar-prerun:32a1d048 failed: exit code: 1" },
    });
  });

  test("once it has ended, nothing more is recorded: an interrupt after it finished doesn't fail it", async () => {
    const { store, written } = memoryStore();
    const recorder = await executionRecorder(store, PLAN, "images");
    await recorder.finish("complete");

    await recorder.fail("interrupted", "Interrupted (SIGINT)");
    await recorder.enter("runs");
    await recorder.finish("failed");

    expect(written).toHaveLength(2);
    expect(recorder.current.status).toBe("complete");
  });

  test("writes go in the order they were made, even when one isn't awaited", async () => {
    const { store, written } = memoryStore();
    const recorder = await executionRecorder(store, PLAN, "beforeExecution");

    void recorder.enter("images");
    void recorder.enter("runs");
    await recorder.fail("run", "Running a container failed");

    expect(written.map(({ status, phase }) => `${status} ${phase}`)).toEqual(["running beforeExecution", "running images", "running runs", "failed runs"]);
  });

  test("a store that can't be written throws a RunDataStoreError, from the first write and from later ones", async () => {
    const { store, state } = memoryStore();
    state.failing = true;
    await expect(executionRecorder(store, PLAN, "images")).rejects.toBeInstanceOf(RunDataStoreError);

    state.failing = false;
    const recorder = await executionRecorder(store, PLAN, "images");
    state.failing = true;
    await expect(recorder.fail("store", "unreachable")).rejects.toBeInstanceOf(RunDataStoreError);
  });
});
