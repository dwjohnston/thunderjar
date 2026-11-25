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

import { describe, expect, test } from "bun:test";
import { FakeRunDataStore, FakeStores } from "./FakeRunDataStore.ts";
import { type ContainerRunRecord, type ExecutionRecord, RunDataStoreError } from "./runDataStore.ts";

const execution = (executionId: string, status: ExecutionRecord["status"] = "complete"): ExecutionRecord => ({
  executionId,
  testCase: "example",
  task: "sums",
  startedAt: "2026-11-01T02:00:00.000Z",
  status,
  matrix: { shape: [1, 1, 1, 1, 1], permutations: 1, iterations: 1 },
});

const containerRun = (executionId: string, permutation: number, iteration: number): ContainerRunRecord => ({
  executionId,
  testCase: "example",
  task: "sums",
  permutation,
  permutationHash: `${permutation}`.repeat(64),
  iteration,
  postrunImage: `postrun:${executionId}-${permutation}-${iteration}`,
  ranAt: "2026-11-01T02:00:00.000Z",
  parameters: {
    baseImage: { name: "node", parameterHash: "a" },
    codeState: { name: "baseline", parameterHash: "b" },
    promptSet: { name: "none", parameterHash: "c" },
    harnessModel: { name: "agent/model", parameterHash: "d" },
    initialPrompt: { name: "plain", parameterHash: "e" },
  },
  harnessModel: { harness: "agent", version: "1.0.0", modelId: "model" },
  execution: { startedAt: 1, finishedAt: 2, exitCode: 0 },
  harnessResult: null,
  result: {},
});

describe(FakeRunDataStore, () => {
  test("a new store is empty, and its check passes", async () => {
    const store = new FakeRunDataStore();
    await store.check();
    expect(await store.listExecutions()).toEqual([]);
    expect(await store.containerRunsOf("01a")).toEqual([]);
  });

  test("lists executions newest first, whatever order they were recorded in", async () => {
    const store = new FakeRunDataStore();
    for (const id of ["01b", "01c", "01a"]) await store.recordExecution(execution(id));
    expect((await store.listExecutions()).map((e) => e.executionId)).toEqual(["01c", "01b", "01a"]);
  });

  test("recording an execution or a container run again replaces its record", async () => {
    const store = new FakeRunDataStore();
    await store.recordExecution(execution("01a", "running"));
    await store.recordExecution(execution("01a", "failed"));
    await store.recordContainerRun(containerRun("01a", 1, 1));
    await store.recordContainerRun({ ...containerRun("01a", 1, 1), harnessResult: "again" });
    expect(await store.listExecutions()).toEqual([execution("01a", "failed")]);
    expect(await store.containerRunsOf("01a")).toEqual([{ ...containerRun("01a", 1, 1), harnessResult: "again" }]);
  });

  test("gives an execution's container runs by permutation, then iteration, and only its own", async () => {
    const store = new FakeRunDataStore();
    for (const [p, i] of [[2, 1], [1, 2], [10, 1], [1, 1]] as const) await store.recordContainerRun(containerRun("01a", p, i));
    await store.recordContainerRun(containerRun("01b", 1, 1));
    expect((await store.containerRunsOf("01a")).map((run) => [run.permutation, run.iteration])).toEqual([[1, 1], [1, 2], [2, 1], [10, 1]]);
  });

  test("keeps a copy: changing a record after recording it, or one read back, doesn't change the store", async () => {
    const store = new FakeRunDataStore();
    const record = containerRun("01a", 1, 1);
    await store.recordContainerRun(record);
    record.harnessResult = "changed after";
    (await store.containerRunsOf("01a"))[0]!.harnessResult = "changed the copy";
    expect((await store.containerRunsOf("01a"))[0]!.harnessResult).toBeNull();
  });

  test("marks postrun images purged, all or only some, and marking again merges", async () => {
    const store = new FakeRunDataStore();
    for (const i of [1, 2]) await store.recordContainerRun(containerRun("01a", 1, i));
    const some = await store.markPostrunsPurged("01a", { purgedAt: "2026-11-02T00:00:00.000Z", from: "daemon" }, [{ permutation: 1, iteration: 2 }]);
    expect(some.map((run) => run.iteration)).toEqual([2]);
    const all = await store.markPostrunsPurged("01a", { purgedAt: "2026-11-03T00:00:00.000Z", from: "imageStore" });
    expect(all.map((run) => run.postrunPurge)).toEqual([
      { purgedAt: "2026-11-03T00:00:00.000Z", from: "imageStore" },
      { purgedAt: "2026-11-02T00:00:00.000Z", from: "both" },
    ]);
    expect((await store.containerRunsOf("01a")).map((run) => run.postrunPurge?.from)).toEqual(["imageStore", "both"]);
    expect(await store.markPostrunsPurged("nope", { purgedAt: "2026-11-03T00:00:00.000Z", from: "daemon" })).toEqual([]);
  });

  test("failWith makes every write throw a RunDataStoreError, and record nothing, until it's cleared", async () => {
    const store = new FakeRunDataStore();
    store.failWith("disk full");
    const error = await store.recordExecution(execution("01a")).catch((e) => e);
    expect(error).toBeInstanceOf(RunDataStoreError);
    expect(error.message).toBe("disk full");
    expect(error.path).toBe("memory");
    expect(store.recordContainerRun(containerRun("01a", 1, 1))).rejects.toThrow("disk full");
    expect(store.markPostrunsPurged("01a", { purgedAt: "2026-11-03T00:00:00.000Z", from: "daemon" })).rejects.toThrow("disk full");
    // Reads and the check still work.
    await store.check();
    expect(await store.listExecutions()).toEqual([]);
    store.failWith(undefined);
    await store.recordExecution(execution("01a"));
    expect(store.executions.map((e) => e.executionId)).toEqual(["01a"]);
  });

  test("failCheckWith makes the check throw a RunDataStoreError", async () => {
    const store = new FakeRunDataStore();
    store.failCheckWith("can't be reached");
    expect(store.check()).rejects.toBeInstanceOf(RunDataStoreError);
  });

  test("counts its writes, and shows its records without awaiting", async () => {
    const store = new FakeRunDataStore();
    await store.recordExecution(execution("01a"));
    await store.recordContainerRun(containerRun("01a", 1, 1));
    await store.recordContainerRun(containerRun("01a", 1, 1));
    expect(store.writes).toEqual(["recordExecution 01a", "recordContainerRun 01a 1-1", "recordContainerRun 01a 1-1"]);
    expect(store.containerRuns.length).toBe(1);
  });
});

describe(FakeStores, () => {
  test("opens the same store each time, in memory, and records the data dirs asked for", async () => {
    const stores = new FakeStores();
    const first = await stores.open();
    const second = await stores.open("elsewhere");
    expect(first.where).toBe("memory");
    expect(first.store).toBe(stores.store);
    expect(second.store).toBe(stores.store);
    expect(stores.opened).toEqual([undefined, "elsewhere"]);
  });

  test("takes a store made beforehand", async () => {
    const store = new FakeRunDataStore();
    expect((await new FakeStores(store).open()).store).toBe(store);
  });
});
