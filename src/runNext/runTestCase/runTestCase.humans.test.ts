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

import { describe, expect, it } from "bun:test";
import { config, fakes } from "../testing/fixtures.ts";
import { runTestCase } from "./runTestCase.ts";

describe(runTestCase, () => {
  it("--dry-run: plans the runs, and builds, runs and records nothing", async () => {
    const deps = fakes();
    deps.random.setUlids("01exec");

    const records = await runTestCase(config({ permutationCount: 2 }), deps, "dry-run");

    // Nothing ran, so there are no records.
    expect(records).toBeUndefined();

    // The plan is left in the state, for the displayer to show.
    expect(deps.state.get().run).toMatchObject({
      mode: "dry-run",
      manifest: {
        executionId: "01exec",
        runs: [{ runId: "01exec-p1000000-i1" }, { runId: "01exec-p2000000-i1" }],
      },
      images: {},
      runs: {},
    });

    // Docker was never touched...
    expect(deps.hostDocker.calls).toEqual([]);
    expect(deps.runtimeDocker.calls).toEqual([]);

    // ...and nothing was recorded.
    expect(await deps.runStore.listExecutions()).toEqual([]);
  });

  it("a real run: builds each image, runs each permutation in its own container, and records it", async () => {
    const deps = fakes();
    deps.random.setUlids("01exec");

    const records = await runTestCase(config({ permutationCount: 2 }), deps);

    // One record per run, each completed.
    expect(records).toMatchObject([
      { runId: "01exec-p1000000-i1", outcome: "completed", postrunImage: "thunderjar-postrun:01exec-1-1" },
      { runId: "01exec-p2000000-i1", outcome: "completed", postrunImage: "thunderjar-postrun:01exec-2-1" },
    ]);

    // The state shows both images ready, and both runs committed.
    const { run } = deps.state.get();
    expect(run.images).toEqual({ "thunderjar-prerun:i1000000": "ready", "thunderjar-prerun:i2000000": "ready" });
    expect(Object.values(run.runs).map((r) => r.status)).toEqual(["committed", "committed"]);

    // What was asked of Docker, in order:
    // build the prerun images, then for each run: run it, read what it left, commit it to a postrun image, remove the container.
    expect(deps.hostDocker.calls).toEqual([]);
    expect(deps.runtimeDocker.calls).toMatchInlineSnapshot(`
      [
        "imagesIn thunderjar-prerun",
        "build thunderjar-prerun:i1000000",
        "build thunderjar-prerun:i2000000",
        "diskUsage",
        "run thunderjar-prerun:i1000000 thunderjar-run-01exec-1-1",
        "readFile thunderjar-run-01exec-1-1 /thunderjar/run.json",
        "readFile thunderjar-run-01exec-1-1 /thunderjar/result.json",
        "readFile thunderjar-run-01exec-1-1 /thunderjar/stderr.log",
        "commit thunderjar-run-01exec-1-1 thunderjar-postrun:01exec-1-1",
        "removeContainer thunderjar-run-01exec-1-1",
        "run thunderjar-prerun:i2000000 thunderjar-run-01exec-2-1",
        "readFile thunderjar-run-01exec-2-1 /thunderjar/run.json",
        "readFile thunderjar-run-01exec-2-1 /thunderjar/result.json",
        "readFile thunderjar-run-01exec-2-1 /thunderjar/stderr.log",
        "commit thunderjar-run-01exec-2-1 thunderjar-postrun:01exec-2-1",
        "removeContainer thunderjar-run-01exec-2-1",
        "diskUsage",
      ]
    `);

    // The execution was recorded as complete.
    expect(await deps.runStore.listExecutions()).toMatchObject([{ executionId: "01exec", status: "complete", matrix: { permutations: 2, iterations: 1 } }]);
  });
});
