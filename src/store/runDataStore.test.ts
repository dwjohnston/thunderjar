import { $ } from "bun";
import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { TMP_DIR } from "../testing/cli.ts";
import { type ContainerRunRecord, type ExecutionRecord, RunDataStoreError, sqliteStore, storeFileIn } from "./runDataStore.ts";

const dirs: string[] = [];
const dataDir = () => {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

const execution = (executionId: string, status: ExecutionRecord["status"] = "complete"): ExecutionRecord => ({
  executionId,
  testCase: "two-harnesses",
  task: "is-prime",
  startedAt: "2026-11-01T02:00:00.000Z",
  finishedAt: "2026-11-01T02:01:00.000Z",
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
  harnessModel: { harness: "fake-harness-alpha", version: "1.0.0", model: "fake-model-small", modelId: "fake-model-small-001" },
  execution: { startedAt: 1793498400000, finishedAt: 1793498400250, exitCode: 0 },
  harnessResult: '{"model":"fake-model-small-001"}\n',
  result: {},
});

const errorOf = (error: unknown) => (error instanceof RunDataStoreError ? { path: error.path, message: error.message } : error);

describe("sqliteStore", () => {
  test("a missing file is an empty store, and reading doesn't create it", async () => {
    const file = storeFileIn(dataDir());
    const store = sqliteStore(file);

    expect(await store.listExecutions()).toEqual([]);
    expect(await store.containerRunsOf("01kxxxxxxxxxxxxxxxxxxxxxxx")).toEqual([]);
    expect(await Bun.file(file).exists()).toBe(false);
  });

  test("the first write creates the file, and its folder; another store of the file reads what was written", async () => {
    const file = `${dataDir()}/nested/runs.sqlite`;
    const store = sqliteStore(file);
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";

    await store.recordExecution(execution(id));
    await store.recordContainerRun(containerRun(id, 1, 1));
    await store.recordContainerRun(containerRun(id, 2, 1));

    const reopened = sqliteStore(file);
    expect(await reopened.listExecutions()).toEqual([execution(id)]);
    expect(await reopened.containerRunsOf(id)).toEqual([containerRun(id, 1, 1), containerRun(id, 2, 1)]);
  });

  test("recording an execution or a container run again replaces its record", async () => {
    const store = sqliteStore(storeFileIn(dataDir()));
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";

    await store.recordExecution(execution(id, "running"));
    await store.recordExecution(execution(id, "failed"));
    await store.recordContainerRun(containerRun(id, 1, 1));
    await store.recordContainerRun({ ...containerRun(id, 1, 1), postrunImage: "again" });

    expect(await store.listExecutions()).toEqual([execution(id, "failed")]);
    expect((await store.containerRunsOf(id)).map((record) => record.postrunImage)).toEqual(["again"]);
  });

  test("lists executions newest first", async () => {
    const store = sqliteStore(storeFileIn(dataDir()));

    await store.recordExecution(execution("01kfa1bgz0bbbbbbbbbbbbbbbb"));
    await store.recordExecution(execution("01kfa1bgz1aaaaaaaaaaaaaaaa"));
    await store.recordExecution(execution("01kfa1bgz0aaaaaaaaaaaaaaaa"));

    expect((await store.listExecutions()).map((record) => record.executionId)).toEqual([
      "01kfa1bgz1aaaaaaaaaaaaaaaa",
      "01kfa1bgz0bbbbbbbbbbbbbbbb",
      "01kfa1bgz0aaaaaaaaaaaaaaaa",
    ]);
  });

  test("gives an execution's container runs by permutation, then iteration, and only its own", async () => {
    const store = sqliteStore(storeFileIn(dataDir()));
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    const other = "01kfa1bgz0bbbbbbbbbbbbbbbb";

    for (const [p, i] of [[10, 1], [2, 2], [2, 1], [1, 10], [1, 2]] as const) await store.recordContainerRun(containerRun(id, p, i));
    await store.recordContainerRun(containerRun(other, 1, 1));

    expect((await store.containerRunsOf(id)).map((record) => [record.permutation, record.iteration])).toEqual([
      [1, 2],
      [1, 10],
      [2, 1],
      [2, 2],
      [10, 1],
    ]);
  });

  test("a record that isn't JSON is a RunDataStoreError naming the file and the record", async () => {
    const file = storeFileIn(dataDir());
    const store = sqliteStore(file);
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    await store.recordExecution(execution(id));
    await store.recordContainerRun(containerRun(id, 1, 1));
    const db = new Database(file);
    db.exec("UPDATE executions SET record = '{'; UPDATE container_runs SET record = '';");
    db.close();

    expect(await sqliteStore(file).listExecutions().catch(errorOf)).toEqual({ path: file, message: expect.stringMatching(new RegExp(`^execution ${id}: `)) });
    expect(await sqliteStore(file).containerRunsOf(id).catch(errorOf)).toEqual({ path: file, message: expect.stringMatching(new RegExp(`^container run ${id} 1-1: `)) });
  });

  test("a file that isn't a store is a RunDataStoreError naming it", async () => {
    const file = storeFileIn(dataDir());
    await Bun.write(file, "not a database, just some text that is long enough to be a header and more");

    expect(await sqliteStore(file).listExecutions().catch(errorOf)).toEqual({ path: file, message: expect.any(String) });
    expect(await sqliteStore(file).recordExecution(execution("01kfa1bgz0aaaaaaaaaaaaaaaa")).catch(errorOf)).toEqual({ path: file, message: expect.any(String) });
  });
});
