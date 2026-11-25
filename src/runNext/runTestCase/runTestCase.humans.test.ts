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
});
