import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonFileStore, type ContainerRunRecord } from "./run-data-store.ts";

/** A store in a fresh temp directory, under a `.data/` folder that doesn't exist yet. */
async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-store-"));
  const path = join(dir, ".data", "runs.json");
  return { dir, path, store: jsonFileStore(path) };
}

const record = (executionId: string, testCase: string, ranAt: string, iteration = 0): ContainerRunRecord => ({
  executionId,
  testCase,
  task: "is-prime",
  permutationHash: "4f9a21c8e0b7".padEnd(64, "0"),
  iteration,
  postrunImage: `postrun-e${executionId}-h4f9a21c8-i0${iteration}`,
  ranAt,
  parameters: {
    baseImage: { name: "node20", parameterHash: "a01f" },
    codeState: { name: "baseline", parameterHash: "b92c" },
    promptSet: { name: "snerk", parameterHash: "c7d4" },
    harnessModel: { name: "claude-code@2.1.283/haiku-4-5", parameterHash: "d5e1" },
    initialPrompt: { name: "plain", parameterHash: "f20b" },
  },
  harnessModel: { family: "claude-code", version: "2.1.283", modelId: "claude-haiku-4-5-20251001" },
  result: {},
  execution: { startedAt: Date.parse(ranAt), finishedAt: Date.parse(ranAt) + 42312, exitCode: 0 },
});

test("a missing file lists no executions", async () => {
  const { store } = await tempStore();
  expect(await store.listExecutions()).toEqual([]);
  expect(await store.listExecutions("is-prime-baseline")).toEqual([]);
});

test("a record round-trips, and nothing but the store file is left behind", async () => {
  const { dir, path, store } = await tempStore();
  const r = record("01k4x9j2e8mqz3", "fake-is-prime", "2026-09-29T14:30:55.104Z");
  await store.recordContainerRun(r);

  const { containerRuns } = (await Bun.file(path).json()) as { containerRuns: ContainerRunRecord[] };
  expect(containerRuns).toEqual([r]);
  expect(readdirSync(join(dir, ".data"))).toEqual(["runs.json"]);
  // A new store on the same file sees it.
  expect(await jsonFileStore(path).listExecutions()).toEqual([
    { executionId: "01k4x9j2e8mqz3", testCase: "fake-is-prime", ranAt: "2026-09-29T14:30:55.104Z", containerRuns: 1 },
  ]);
});

test("groups container runs into executions, newest first, and filters by test case", async () => {
  const { store } = await tempStore();
  // Recorded out of order, with each execution's runs at different times.
  for (const r of [
    record("01k4x9j2e8mqz3", "fake-is-prime", "2026-09-29T14:30:55.000Z", 0),
    record("01k4w3m8r5d1ha", "is-prime-baseline", "2026-09-28T09:12:00.000Z", 0),
    record("01k4x9j2e8mqz3", "fake-is-prime", "2026-09-29T14:31:40.000Z", 1),
    record("01k4xb7q0c2tnv", "fake-is-prime", "2026-09-29T15:02:10.000Z", 0),
    record("01k4w3m8r5d1ha", "is-prime-baseline", "2026-09-28T09:15:00.000Z", 1),
    record("01k4w3m8r5d1ha", "is-prime-baseline", "2026-09-28T09:18:00.000Z", 2),
  ]) {
    await store.recordContainerRun(r);
  }

  expect(await store.listExecutions()).toEqual([
    { executionId: "01k4xb7q0c2tnv", testCase: "fake-is-prime", ranAt: "2026-09-29T15:02:10.000Z", containerRuns: 1 },
    { executionId: "01k4x9j2e8mqz3", testCase: "fake-is-prime", ranAt: "2026-09-29T14:30:55.000Z", containerRuns: 2 },
    { executionId: "01k4w3m8r5d1ha", testCase: "is-prime-baseline", ranAt: "2026-09-28T09:12:00.000Z", containerRuns: 3 },
  ]);
  expect((await store.listExecutions("fake-is-prime")).map((e) => e.executionId)).toEqual([
    "01k4xb7q0c2tnv",
    "01k4x9j2e8mqz3",
  ]);
  expect(await store.listExecutions("no-such-test-case")).toEqual([]);
});

test("executions that started at the same moment are ordered by execution ID", async () => {
  const { store } = await tempStore();
  await store.recordContainerRun(record("01k4x9j2e8mqz3", "a", "2026-09-29T14:30:55.000Z"));
  await store.recordContainerRun(record("01k4x9j2e8mqz4", "b", "2026-09-29T14:30:55.000Z"));
  expect((await store.listExecutions()).map((e) => e.executionId)).toEqual(["01k4x9j2e8mqz4", "01k4x9j2e8mqz3"]);
});

const measure = (data: unknown, measuredAt = "2026-09-29T14:31:02.000Z") => ({
  instrument: "fileCreated",
  contentHash: "7b21ac90".padEnd(64, "0"),
  measuredAt,
  outcome: { outcome: "measured" as const, data },
});

test("recordMeasures merges measures into a recorded run's result by name, overwriting one of the same name", async () => {
  const { path, store } = await tempStore();
  const first = record("01k4x9j2e8mqz3", "fake-is-prime", "2026-09-29T14:30:55.000Z", 0);
  const second = record("01k4x9j2e8mqz3", "fake-is-prime", "2026-09-29T14:31:40.000Z", 1);
  await store.recordContainerRun(first);
  await store.recordContainerRun(second);

  await store.recordMeasures(first.postrunImage, { isPrimeTsExists: measure(true), readmeExists: measure(false) });
  // Later, as a backfill would: one measure re-taken, one added.
  const later = "2026-12-14T09:02:44.000Z";
  await store.recordMeasures(first.postrunImage, { readmeExists: measure(true, later), tsIgnoreCount: measure(0, later) });

  const { containerRuns } = (await Bun.file(path).json()) as { containerRuns: ContainerRunRecord[] };
  expect(containerRuns[0]).toEqual({
    ...first,
    result: {
      isPrimeTsExists: measure(true),
      readmeExists: measure(true, later),
      tsIgnoreCount: measure(0, later),
    },
  });
  // The other run is untouched.
  expect(containerRuns[1]).toEqual(second);
});

test("recordMeasures for a run that isn't recorded fails and changes nothing", async () => {
  const { path, store } = await tempStore();
  const r = record("01k4x9j2e8mqz3", "fake-is-prime", "2026-09-29T14:30:55.000Z");
  await store.recordContainerRun(r);
  const before = await Bun.file(path).text();
  await expect(store.recordMeasures("postrun-enope-h00000000-i00", { a: measure(true) })).rejects.toThrow(
    "no container run recorded for postrun-enope-h00000000-i00",
  );
  expect(await Bun.file(path).text()).toBe(before);
});

/** A run of permutation `hash` in execution `executionId`, as `run` would tag it. */
const runOf = (executionId: string, hash: string, iteration: number): ContainerRunRecord => ({
  ...record(executionId, "fake-is-prime", `2026-09-29T14:3${iteration}:00.000Z`, iteration),
  permutationHash: hash.padEnd(64, "0"),
  postrunImage: `postrun-e${executionId}-h${hash}-i0${iteration}`,
});

test("getExecution gives an execution's runs by permutation, in the order they were first recorded, then by iteration", async () => {
  const { store } = await tempStore();
  const id = "01k4x9j2e8mqz3";
  // Two permutations, with an iteration of each recorded out of order, and another execution between.
  for (const r of [
    runOf(id, "4f9a21c8", 1),
    runOf(id, "4f9a21c8", 0),
    runOf("01k4xb7q0c2tnv", "4f9a21c8", 0),
    runOf(id, "0be07d35", 0),
    runOf(id, "4f9a21c8", 2),
    runOf(id, "0be07d35", 1),
  ]) {
    await store.recordContainerRun(r);
  }

  expect((await store.getExecution(id)).map((r) => r.postrunImage)).toEqual([
    `postrun-e${id}-h4f9a21c8-i00`,
    `postrun-e${id}-h4f9a21c8-i01`,
    `postrun-e${id}-h4f9a21c8-i02`,
    `postrun-e${id}-h0be07d35-i00`,
    `postrun-e${id}-h0be07d35-i01`,
  ]);
  expect(await store.getExecution("01k4xb7q0c2tnv")).toEqual([runOf("01k4xb7q0c2tnv", "4f9a21c8", 0)]);
  expect(await store.getExecution("01k4xc00000000")).toEqual([]);
});

test("getContainerRun finds a run by its postrun tag, with its measures, or gives undefined", async () => {
  const { store } = await tempStore();
  expect(await store.getContainerRun("postrun-e01k4x9j2e8mqz3-h4f9a21c8-i00")).toBeUndefined();

  const first = runOf("01k4x9j2e8mqz3", "4f9a21c8", 0);
  const second = runOf("01k4x9j2e8mqz3", "4f9a21c8", 1);
  await store.recordContainerRun(first);
  await store.recordContainerRun(second);
  await store.recordMeasures(second.postrunImage, { isPrimeTsExists: measure(true) });

  expect(await store.getContainerRun(first.postrunImage)).toEqual(first);
  expect(await store.getContainerRun(second.postrunImage)).toEqual({ ...second, result: { isPrimeTsExists: measure(true) } });
  expect(await store.getContainerRun("postrun-e01k4x9j2e8mqz3-h4f9a21c8-i02")).toBeUndefined();
  expect(await store.getContainerRun("01k4x9j2e8mqz3")).toBeUndefined();
});
