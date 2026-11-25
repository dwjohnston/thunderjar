// How to use FakeRunDataStore: seed it, pass it where a RunDataStore goes, then read what was written.
import { describe, expect, it } from "bun:test";
import { FakeRunDataStore } from "./FakeRunDataStore.ts";
import { type ExecutionRecord, type RunDataStore, RunDataStoreError } from "./RunDataStore.ts";

/** Code under test: marks a running execution complete. */
async function finishExecution(store: RunDataStore, executionId: string, finishedAt: string): Promise<void> {
  const record = (await store.listExecutions()).find((execution) => execution.executionId === executionId);
  if (record === undefined) throw new Error(`no execution ${executionId}`);
  await store.recordExecution({ ...record, status: "complete", finishedAt });
}

const running: ExecutionRecord = {
  executionId: "01kfa1bgz0aaaaaaaaaaaaaaaa",
  testCase: "two-harnesses",
  task: "is-prime",
  startedAt: "2026-11-01T02:00:00.000Z",
  status: "running",
  matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 1 },
};

describe(finishExecution, () => {
  it("records the execution as complete", async () => {
    const store = new FakeRunDataStore({ executions: [running] });

    await finishExecution(store, running.executionId, "2026-11-01T02:05:00.000Z");

    expect(store.executions.get(running.executionId)).toEqual({ ...running, status: "complete", finishedAt: "2026-11-01T02:05:00.000Z" });
  });

  it("passes on a store that can't be reached", async () => {
    const store = new FakeRunDataStore({ executions: [running] });
    store.failure = new RunDataStoreError("Postgres at $THUNDERJAR_DB_URL", "connection refused");

    await expect(finishExecution(store, running.executionId, "2026-11-01T02:05:00.000Z")).rejects.toBeInstanceOf(RunDataStoreError);
  });
});
