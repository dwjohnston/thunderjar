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
import { plan } from "../../../runNext/plan/plan.ts";
import { config, permutation } from "../../../runNext/testing/fixtures.ts";
import type { Manifest } from "../../../runNext/types.ts";
import { addTiming, emptyRunState, patchRun, type RunState, setImageStatus } from "../../../services/ApplicationState/ApplicationState.ts";
import type { ContainerRunRecord } from "../../../services/RunDataStore/RunDataStore.ts";
import { fitTo, renderRun } from "./renderRun.ts";

const manifest = plan(config({ permutationCount: 2, iterations: 2 }), { concurrency: 2, executionId: "01exec" });
const [first, second, third] = manifest.runs.map(({ runId }) => runId) as [string, string, string];
const planned: RunState<Manifest> = { ...emptyRunState<Manifest>(), manifest };
const NOW = 100_000;

/** As much of a run's record as a frame reads. */
const record = (execution: Partial<ContainerRunRecord["execution"]>, rest: Partial<ContainerRunRecord> = {}) =>
  ({ execution: { startedAt: 0, finishedAt: 31_000, exitCode: 0, timedOut: false, ...execution }, harnessResult: "{}", result: {}, ...rest }) as ContainerRunRecord;

describe(renderRun, () => {
  test("draws nothing before there's a manifest", () => {
    expect(renderRun(emptyRunState<Manifest>(), NOW)).toBe("");
  });

  test("a dry run is the manifest alone: each permutation's images, and what each of its containers is given and runs", () => {
    const given = permutation(1, { env: ["API_KEY"], testCaseEnv: { MODE: "fast" }, runOptions: ["--memory", "2g"] });
    const dry = plan(config({ permutations: [given] }), { concurrency: 1, executionId: "01exec" });

    expect(renderRun({ ...emptyRunState<Manifest>(), manifest: dry, mode: "dry-run" }, NOW)).toBe(`Execution 01exec

Permutation 1: prerun image thunderjar-prerun:i1000000
  Iteration 1: postrun image thunderjar-postrun:01exec-1-1
    env:      API_KEY, MODE=fast
    docker:   --memory 2g
    command:  sh /thunderjar/thunderjar-run.sh
`);
  });

  test("while images are made ready, shows where each is", () => {
    const state = setImageStatus(setImageStatus(planned, "thunderjar-prerun:i1000000", "ready"), "thunderjar-prerun:i2000000", "building");

    expect(renderRun(state, NOW)).toBe(`Execution 01exec  example
  2 permutations, 4 runs, up to 2 at once

Images
  thunderjar-prerun:i1000000  ready
  thunderjar-prerun:i2000000  building
`);
  });

  test("while it runs, each run is on a line: what tells its permutation apart, and where it is", () => {
    let state = manifest.runs.reduce((queued, { runId }) => patchRun(queued, runId, { status: "queued" }), planned);
    state = patchRun(state, first, { status: "uploading", startedAt: 0, finishedAt: 31_000, measuring: "measuring", record: record({}) });
    state = patchRun(state, second, { status: "running", startedAt: 88_000 });
    state = { ...state, uploadBacklog: 1 };

    expect(renderRun(state, NOW)).toBe(`Execution 01exec  example
  2 permutations, 4 runs, up to 2 at once

Runs
  1.1  harness-1/model  completed  0:31  uploading  measuring
  1.2  harness-1/model  running 0:12
  2.1  harness-2/model  queued
  2.2  harness-2/model  queued

Upload backlog: 1
`);
  });

  test("once it's over, says how each run ended, with its measures and what went wrong under it, then counts them and says where they're recorded", () => {
    const measured = { exists: { instrument: "fileExists", contentHash: "h", measuredAt: "t", outcome: { outcome: "measured" as const, data: true } } };
    let state = patchRun(planned, first, { status: "uploaded", startedAt: 0, finishedAt: 31_000, measuring: "measured", record: record({}, { result: measured }) });
    state = patchRun(state, second, { status: "crashed", startedAt: 0, finishedAt: 2_000, record: record({ exitCode: 2, finishedAt: 2_000 }, { harnessStderr: "boom\n" }) });
    state = patchRun(state, third, { status: "timedOut", startedAt: 0, finishedAt: 600_000, record: record({ exitCode: null, timedOut: true, timeoutSeconds: 600 }, { harnessResult: null }) });
    state = { ...state, execution: { executionId: "01exec", testCase: "example", task: "is-prime", startedAt: "s", finishedAt: "f", status: "failed", matrix: { shape: [], permutations: 2, iterations: 2 } } };
    state = { ...state, recordedIn: "/project/.thunderjar/.data/runs.sqlite" };

    expect(renderRun(state, NOW, { cwd: "/project" })).toBe(`Execution 01exec  example
  2 permutations, 4 runs, up to 2 at once

Runs
  1.1  harness-1/model  completed  0:31  uploaded
       exists: true
  1.2  harness-1/model  crashed (exited 2)  0:02
       boom
  2.1  harness-2/model  timed out after 600s  10:00
  2.2  harness-2/model  queued

4 runs: 1 completed, 1 crashed, 1 timed out, 1 not run
Recorded in .thunderjar/.data/runs.sqlite
`);
  });

  test("build-only ends by saying the images are ready, and shows timings if asked", () => {
    const ready = setImageStatus(planned, "thunderjar-prerun:i1000000", "ready");
    const state = { ...addTiming(addTiming(ready, "build", 34_000), "build", 2_000), mode: "build-only" as const, showTimings: true };

    expect(renderRun(state, NOW)).toBe(`Execution 01exec  example
  2 permutations, 4 runs, up to 2 at once

Images
  thunderjar-prerun:i1000000  ready

1 prerun image ready

Timings
  building prerun images  2×  total 0:36  longest 0:34
`);
  });
});

describe(fitTo, () => {
  test("cuts each line that's too wide, and leaves the rest", () => {
    expect(fitTo("short\na line that is too wide\n", 10)).toBe("short\na line th…\x1b[0m\n");
  });

  test("doesn't count colour codes", () => {
    expect(fitTo("\x1b[32mgreen\x1b[39m\n", 5)).toBe("\x1b[32mgreen\x1b[39m\n");
  });
});
