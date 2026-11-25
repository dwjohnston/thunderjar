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


        // The state at the end. toMatchObject ignores what isn't listed, such as each run's full record.
        expect(deps.state.get().run).toMatchObject({
            execution: {
                executionId: "01exec",
                testCase: "example",
                task: "is-prime",
                status: "complete",
                startedAt: "1970-01-01T00:16:40.000Z",
                finishedAt: "1970-01-01T00:16:40.000Z",
                matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 1 },
            },
            images: {},
            runs: {
                // 🙋‍♂️ nb. these is not the full objects  
                // There is also a record object that 
                "01exec-p1000000-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-p2000000-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
            },
            timings: {
                agent: { count: 2, maxMs: 0, totalMs: 0 },
                collect: { count: 2, maxMs: 0, totalMs: 0 },
                commit: { count: 2, maxMs: 0, totalMs: 0 },
            },
            uploadBacklog: 0,
        });

        // history() is the state after every update. There are 16 here:
        //   0      the empty state, before anything happens
        //   1      every run queued, in one update
        //   2      the execution recorded as running
        //   3-8    run 1: running → agent timed → output collected → committing → commit timed → committed, with its record
        //   9-14   run 2: the same 6 steps
        //   15     the execution recorded as complete
        // So each run is 6 updates: 3 status changes, and 3 timings (agent, collect, commit).
        expect(deps.state.history()).toHaveLength(16);


        // The run data store has the execution, complete, and a record of each run.
        expect(await deps.runStore.listExecutions()).toMatchObject([{ executionId: "01exec", status: "complete", matrix: { permutations: 2, iterations: 1 } }]);
        expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([{ permutation: 1 }, { permutation: 2 }]);
    });
});
