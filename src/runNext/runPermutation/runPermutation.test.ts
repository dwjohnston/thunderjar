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
import { plan } from "../plan/plan.ts";
import { config, fakes, type Fakes, permutation } from "../testing/fixtures.ts";
import type { CommittedImage, TestCaseConfig } from "../types.ts";
import type { UploadQueue } from "../uploadQueue/uploadQueue.ts";
import { runPermutation } from "./runPermutation.ts";

const RUN_ID = "01exec-oooooooo-i1";
const CONTAINER = "thunderjar-run-01exec-1-1";
const POSTRUN = "thunderjar-postrun:01exec-1-1";
const STARTED = 1_700_000_000_000;

/** What the timed run leaves in /thunderjar/run.json. */
const ranFor = (ms: number, exitCode: number) => JSON.stringify({ startedAt: STARTED, finishedAt: STARTED + ms, exitCode });

/** An upload queue that only lists what it's given. */
function listingQueue(): UploadQueue & { enqueued: CommittedImage[] } {
  const enqueued: CommittedImage[] = [];
  return { enqueued, enqueue: (image) => void enqueued.push(image), backlog: () => enqueued.length, drain: async () => {}, failures: () => [] };
}

function setup(overrides: Partial<TestCaseConfig> = {}) {
  const deps = fakes();
  const resolved = config(overrides);
  const manifest = plan(resolved, { concurrency: 1, executionId: "01exec" });
  const uploads = listingQueue();
  return { deps, uploads, context: { manifest, config: resolved }, run: manifest.runs[0]! };
}

/** Each status the run went through, in order. */
const statuses = (deps: Fakes) =>
  deps.state
    .history()
    .map((state) => state.run.runs[RUN_ID]?.status)
    .filter((status, i, all) => status !== undefined && status !== all[i - 1]);

describe(runPermutation, () => {
  test("an agent that exits 0 is committed, recorded, and completed, and its container removed", async () => {
    const { deps, uploads, context, run } = setup();
    deps.runtimeDocker.onRun("-1-1", () => ({ files: { "/thunderjar/run.json": ranFor(31_000, 0), "/thunderjar/result.json": '{"result":"done"}' } }));

    const record = await runPermutation(run, context, deps, uploads);

    expect(record).toMatchObject({ runId: RUN_ID, outcome: "completed", startedAt: STARTED, finishedAt: STARTED + 31_000, postrunImage: POSTRUN });
    expect(statuses(deps)).toEqual(["running", "committing", "committed"]);
    expect(deps.runtimeDocker.calls.filter((call) => !call.startsWith("readFile"))).toEqual([
      `run thunderjar-prerun:i1000000 ${CONTAINER}`,
      `commit ${CONTAINER} ${POSTRUN}`,
      `removeContainer ${CONTAINER}`,
    ]);
    expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([
      { permutation: 1, iteration: 1, postrunImage: POSTRUN, harnessResult: '{"result":"done"}', execution: { exitCode: 0, timedOut: false }, result: {} },
    ]);
    expect(uploads.enqueued).toEqual([]);
  });

  test("with an image store, its post-run image is enqueued to upload, and recorded by where it's pushed", async () => {
    const { deps, uploads, context, run } = setup({ imageStore: { repository: "ghcr.io/acme/images" } });
    const stored = "ghcr.io/acme/images:postrun-e01exec-hoooooooo-i00";

    const record = await runPermutation(run, context, deps, uploads);

    expect(uploads.enqueued).toEqual([{ runId: RUN_ID, image: POSTRUN, reference: stored }]);
    expect(record.postrunImage).toBe(stored);
    expect(deps.runtimeDocker.calls[0]).toBe(`run ghcr.io/acme/images:prerun-hi1000000 ${CONTAINER}`);
  });

  test("an agent that exits non-zero is crashed: committed and recorded all the same", async () => {
    const { deps, uploads, context, run } = setup();
    deps.runtimeDocker.onRun("-1-1", () => ({ files: { "/thunderjar/run.json": ranFor(2_000, 2), "/thunderjar/stderr.log": "boom\n" } }));

    const record = await runPermutation(run, context, deps, uploads);

    expect(record).toMatchObject({ outcome: "crashed", postrunImage: POSTRUN });
    expect(statuses(deps)).toEqual(["running", "committing", "crashed"]);
    expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([{ execution: { exitCode: 2 }, harnessStderr: "boom\n" }]);
  });

  test("an agent killed at its timeout is timedOut, finished when it was killed", async () => {
    const { deps, uploads, context, run } = setup();
    deps.runtimeDocker.onRun("-1-1", () => ({
      stop: { outcome: "timedOut", killedAt: STARTED + 600_000 },
      // Killed, the timed run never wrote its end.
      files: { "/thunderjar/run.json": JSON.stringify({ startedAt: STARTED }) },
    }));

    const record = await runPermutation(run, context, deps, uploads);

    expect(record).toMatchObject({ outcome: "timedOut", finishedAt: STARTED + 600_000 });
    expect(deps.state.get().run.runs[RUN_ID]?.status).toBe("timedOut");
    expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([{ execution: { exitCode: null, timedOut: true, timeoutSeconds: 600 } }]);
  });

  test("a container that never starts is crashed, recorded with why, and has nothing to commit", async () => {
    const { deps, uploads, context, run } = setup();
    deps.runtimeDocker.onRun("-1-1", () => ({ stop: { outcome: "notStarted", reason: "no such image", spawnedAt: STARTED, gaveUpAt: STARTED + 50 } }));

    const record = await runPermutation(run, context, deps, uploads);

    expect(record).toMatchObject({ outcome: "crashed", startedAt: STARTED, finishedAt: STARTED + 50 });
    expect(record.postrunImage).toBeUndefined();
    expect(deps.runtimeDocker.calls.some((call) => call.startsWith("commit"))).toBe(false);
    expect(deps.state.get().run.runs[RUN_ID]).toMatchObject({ status: "crashed", error: "Its container didn't start: no such image" });
    expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([{ execution: { failedToStart: "no such image", exitCode: null } }]);
  });

  test("never throws: Docker failing under it is a crashed run, with why", async () => {
    const { deps, uploads, context, run } = setup();
    deps.runtimeDocker.failNext("commit", new Error("no space left on device"));

    const record = await runPermutation(run, context, deps, uploads);

    expect(record).toMatchObject({ outcome: "crashed", error: "no space left on device" });
    expect(deps.state.get().run.runs[RUN_ID]).toMatchObject({ status: "crashed", error: "no space left on device" });
    expect(deps.runtimeDocker.calls.at(-1)).toBe(`removeContainer ${CONTAINER}`);
  });

  test("never throws: a run left without a valid run.json is a crashed run", async () => {
    const { deps, uploads, context, run } = setup();
    deps.runtimeDocker.onRun("-1-1", () => ({ files: {} }));

    const record = await runPermutation(run, context, deps, uploads);

    expect(record.outcome).toBe("crashed");
    expect(record.error).toContain("left no valid /thunderjar/run.json");
  });

  test("its container is given its harness's variables by name, the test case's env by value, and its base image's run options", async () => {
    const given = permutation(1, { env: ["API_KEY"], testCaseEnv: { MODE: "fast" }, secretEnv: ["TOKEN"], runOptions: ["--memory", "2g"], timeoutSeconds: 90 });
    const { deps, uploads, context, run } = setup({ permutations: [given] });
    let options: unknown;
    deps.runtimeDocker.onRun("-1-1", (container) => {
      options = container.options;
      return {};
    });

    await runPermutation(run, context, deps, uploads);

    expect(options).toEqual({
      env: ["API_KEY"],
      runOptions: ["--memory", "2g"],
      setEnv: { MODE: "fast" },
      secretEnv: ["TOKEN"],
      timeoutSeconds: 90,
      startMarker: "thunderjar: run script started",
    });
  });
});
