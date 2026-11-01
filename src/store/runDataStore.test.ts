import { $, Glob } from "bun";
import { afterEach, describe, expect, test } from "bun:test";
import { TMP_DIR } from "../testing/cli.ts";
import { type ContainerRunRecord, type ExecutionRecord, executionFolder, fileStore } from "./runDataStore.ts";

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

const filesIn = (dir: string) => [...new Glob("**").scanSync({ cwd: dir, dot: true })].sort();

describe("fileStore", () => {
  test("a missing folder is an empty store", async () => {
    const store = fileStore(dataDir());

    expect(await store.listExecutions()).toEqual([]);
    expect(await store.containerRunsOf("01kxxxxxxxxxxxxxxxxxxxxxxx")).toEqual([]);
  });

  test("writes an execution's records as pretty JSON, one folder per execution", async () => {
    const dir = dataDir();
    const store = fileStore(dir);
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";

    await store.recordExecution(execution(id));
    await store.recordContainerRun(containerRun(id, 1, 1));
    await store.recordContainerRun(containerRun(id, 2, 1));

    expect(filesIn(dir)).toEqual([
      `runs/${id}/container-runs/1-1.json`,
      `runs/${id}/container-runs/2-1.json`,
      `runs/${id}/execution.json`,
    ]);
    expect(await Bun.file(`${executionFolder(dir, id)}/execution.json`).text()).toBe(`${JSON.stringify(execution(id), null, 2)}\n`);
    expect(await Bun.file(`${executionFolder(dir, id)}/container-runs/2-1.json`).json()).toEqual(containerRun(id, 2, 1));
  });

  test("recording an execution again replaces its record", async () => {
    const store = fileStore(dataDir());
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";

    await store.recordExecution(execution(id, "running"));
    await store.recordExecution(execution(id, "failed"));

    expect(await store.listExecutions()).toEqual([execution(id, "failed")]);
  });

  test("lists executions newest first", async () => {
    const store = fileStore(dataDir());

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
    const store = fileStore(dataDir());
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

  test("leaves no temporary files behind", async () => {
    const dir = dataDir();
    const store = fileStore(dir);
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";

    await store.recordContainerRun(containerRun(id, 1, 1));
    await store.recordContainerRun(containerRun(id, 1, 1));

    expect(filesIn(dir)).toEqual([`runs/${id}/container-runs/1-1.json`]);
  });
});
