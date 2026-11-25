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
import { plan } from "../plan/plan.ts";
import { config, fakes } from "../testing/fixtures.ts";
import { runManifest } from "./runManifest.ts";

/** Each distinct value, in the order it first appeared. */
const changes = <T>(values: T[]): T[] => values.filter((value, i) => i === 0 || JSON.stringify(value) !== JSON.stringify(values[i - 1]));

describe(runManifest, () => {
  it("happy path: records the execution as running, runs each run in turn, then records it complete", async () => {
    const deps = fakes();
    const testCase = config({ permutationCount: 2 });
    const manifest = plan(testCase, { concurrency: 1, executionId: "01exec" });

    const records = await runManifest(manifest, testCase, deps);

    // Every run completed.
    expect(records.map(({ runId, outcome }) => `${runId} ${outcome}`)).toEqual([
      "01exec-p1000000-i1 completed",
      "01exec-p2000000-i1 completed",
    ]);

    // How the execution's status changed in the state.
    expect(changes(deps.state.history().map(({ run }) => run.execution?.status))).toMatchInlineSnapshot(`
      [
        undefined,
        "running",
        "complete",
      ]
    `);

    // How each run's status changed in the state: all queued first, then one at a time.
    expect(changes(deps.state.history().map(({ run }) => Object.values(run.runs).map((r) => r.status).join(", ")))).toMatchInlineSnapshot(`
      [
        "",
        "queued, queued",
        "running, queued",
        "committing, queued",
        "committed, queued",
        "committed, running",
        "committed, committing",
        "committed, committed",
      ]
    `);

    // The run data store has the execution, complete, and a record of each run.
    expect(await deps.runStore.listExecutions()).toMatchObject([{ executionId: "01exec", status: "complete", matrix: { permutations: 2, iterations: 1 } }]);
    expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([{ permutation: 1 }, { permutation: 2 }]);
  });
});
