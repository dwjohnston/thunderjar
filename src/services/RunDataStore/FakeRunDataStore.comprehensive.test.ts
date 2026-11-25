// The same checks against FakeRunDataStore and the real SQLite store, so the fake can't drift from it.
import { $ } from "bun";
import { afterEach, describe, expect, test } from "bun:test";
import { TMP_DIR } from "../../testing/cli.ts";
import { FakeRunDataStore } from "./FakeRunDataStore.ts";
import {
  type ContainerRunRecord,
  type ExecutionRecord,
  type PostrunPurge,
  type RunDataStore,
  RunDataStoreError,
  sqliteStore,
  storeFileIn,
} from "./RunDataStore.ts";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

const stores: [string, () => RunDataStore][] = [
  ["FakeRunDataStore", () => new FakeRunDataStore()],
  [
    "sqliteStore",
    () => {
      const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
      dirs.push(dir);
      return sqliteStore(storeFileIn(dir));
    },
  ],
];

const execution = (executionId: string, status: ExecutionRecord["status"] = "complete"): ExecutionRecord => ({
  executionId,
  testCase: "two-harnesses",
  task: "is-prime",
  startedAt: "2026-11-01T02:00:00.000Z",
  status,
  matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 1 },
});

const containerRun = (executionId: string, permutation: number, iteration: number): ContainerRunRecord => ({
  executionId,
  testCase: "two-harnesses",
  task: "is-prime",
  permutation,
  permutationHash: `${permutation}`.repeat(64),
  iteration,
  postrunImage: `thunderjar-postrun:${executionId}-${permutation}-${iteration}`,
  ranAt: "2026-11-01T02:00:00.000Z",
  parameters: {
    baseImage: { name: "node20", parameterHash: "a".repeat(64) },
    codeState: { name: "baseline", parameterHash: "b".repeat(64) },
    promptSet: { name: "snerk", parameterHash: "c".repeat(64) },
    harnessModel: { name: "fake-harness-alpha@1.0.0/fake-model-small", parameterHash: "d".repeat(64) },
    initialPrompt: { name: "plain", parameterHash: "e".repeat(64) },
  },
  harnessModel: { harness: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" },
  execution: { startedAt: 1793498400000, finishedAt: 1793498400250, exitCode: 0 },
  harnessResult: null,
  result: {},
});

const A = "01kfa1bgz0aaaaaaaaaaaaaaaa";
const B = "01kfa1bgz1bbbbbbbbbbbbbbbb";
const PURGE: PostrunPurge = { purgedAt: "2026-11-19T09:00:00.000Z", from: "imageStore", reason: "held leaked keys" };

describe.each(stores)("%s", (_name, create) => {
  test("an empty store has no executions or runs, and checks fine", async () => {
    const store = create();
    await store.check();
    expect(await store.listExecutions()).toEqual([]);
    expect(await store.containerRunsOf(A)).toEqual([]);
  });

  test("recording again replaces the record", async () => {
    const store = create();
    await store.recordExecution(execution(A, "running"));
    await store.recordExecution(execution(A, "failed"));
    await store.recordContainerRun(containerRun(A, 1, 1));
    await store.recordContainerRun({ ...containerRun(A, 1, 1), postrunImage: "again" });

    expect(await store.listExecutions()).toEqual([execution(A, "failed")]);
    expect((await store.containerRunsOf(A)).map((run) => run.postrunImage)).toEqual(["again"]);
  });

  test("lists executions newest first, and an execution's own runs by permutation then iteration", async () => {
    const store = create();
    await store.recordExecution(execution(A));
    await store.recordExecution(execution(B));
    for (const [permutation, iteration] of [[2, 1], [1, 2], [1, 1]] as const) await store.recordContainerRun(containerRun(A, permutation, iteration));
    await store.recordContainerRun(containerRun(B, 1, 1));

    expect((await store.listExecutions()).map((record) => record.executionId)).toEqual([B, A]);
    expect((await store.containerRunsOf(A)).map((run) => [run.permutation, run.iteration])).toEqual([[1, 1], [1, 2], [2, 1]]);
  });

  test("marks every run, or only those named, ignoring runs not recorded; marking again merges", async () => {
    const store = create();
    await store.recordContainerRun(containerRun(A, 1, 1));
    await store.recordContainerRun(containerRun(A, 2, 1));

    const some = await store.markPostrunsPurged(A, PURGE, [{ permutation: 2, iteration: 1 }, { permutation: 9, iteration: 9 }]);
    expect(some.map((run) => run.permutation)).toEqual([2]);

    const all = await store.markPostrunsPurged(A, { purgedAt: "2026-11-20T00:00:00.000Z", from: "daemon" });
    expect(all.map((run) => run.postrunPurge)).toEqual([
      { purgedAt: "2026-11-20T00:00:00.000Z", from: "daemon" },
      { purgedAt: PURGE.purgedAt, from: "both", reason: PURGE.reason },
    ]);
    expect(await store.containerRunsOf(A)).toEqual(all);
    expect(await store.markPostrunsPurged(B, PURGE)).toEqual([]);
  });

  test("a record given to the store and later changed doesn't change what it holds", async () => {
    const store = create();
    const record = execution(A);
    await store.recordExecution(record);
    record.status = "failed";
    expect((await store.listExecutions())[0]?.status).toBe("complete");
  });
});

describe(FakeRunDataStore, () => {
  test("starts with the records it's seeded with", async () => {
    const store = new FakeRunDataStore({ executions: [execution(A)], containerRuns: [containerRun(A, 1, 1)] });
    expect(await store.listExecutions()).toEqual([execution(A)]);
    expect(await store.containerRunsOf(A)).toEqual([containerRun(A, 1, 1)]);
  });

  test("with a failure set, every call throws it", async () => {
    const store = new FakeRunDataStore();
    store.failure = new RunDataStoreError("Postgres at $THUNDERJAR_DB_URL", "connection refused");
    await expect(store.check()).rejects.toBe(store.failure);
    await expect(store.recordExecution(execution(A))).rejects.toBe(store.failure);
    await expect(store.listExecutions()).rejects.toBe(store.failure);
  });
});
