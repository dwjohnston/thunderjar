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
        // Hashes that are easy to tell apart: they give the run IDs 01exec-oooooooo-i1 and 01exec-xxxxxxxx-i1.
        testCase.permutations[0]!.permutation.hash = "o".repeat(64);
        testCase.permutations[1]!.permutation.hash = "x".repeat(64);
        // Each harness reads the agent's reply from its result file.
        for (const permutation of testCase.permutations) {
            permutation.harness = { ...permutation.harness, collectReply: (result) => JSON.parse(result).reply };
        }
        // Each container exits 0, and leaves a result file with the agent's reply.
        for (const container of ["-1-1", "-2-1"]) {
            deps.runtimeDocker.onRun(container, () => ({
                files: {
                    "/thunderjar/run.json": JSON.stringify({ startedAt: 1_000_001_000_000, finishedAt: 1_000_001_000_000, exitCode: 0 }),
                    "/thunderjar/result.json": JSON.stringify({ reply: "Done: isPrime(7) is true." }),
                },
            }));
        }
        const manifest = plan(testCase, { concurrency: 1, executionId: "01exec" });

        const records = await runManifest(manifest, testCase, deps);

        // Every run completed.
        expect(records.map(({ runId, outcome }) => `${runId} ${outcome}`)).toEqual([
            "01exec-oooooooo-i1 completed",
            "01exec-xxxxxxxx-i1 completed",
        ]);

        // Each run's record has the agent's reply, read from its result file.
        expect(records.map(({ containerRun }) => containerRun?.reply)).toEqual([
            { outcome: "collected", text: "Done: isPrime(7) is true." },
            { outcome: "collected", text: "Done: isPrime(7) is true." },
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
                "01exec-oooooooo-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-xxxxxxxx-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
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


        // 0: the empty state, before anything happens
        expect(Object.keys(deps.state.history().at(0)!.run.runs).length).toBe(0);
        expect(deps.state.history().at(0)!.run.execution).toBeUndefined();

        // 1: every run queued, in one update
        expect(deps.state.history().at(1)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("queued");
        expect(deps.state.history().at(1)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("queued");
        expect(deps.state.history().at(1)!.run.execution).toBeUndefined();

        // 2: the execution recorded as running
        expect(deps.state.history().at(2)!.run.execution?.status).toBe("running");

        // 3-8: run 1 goes running → committing → committed, while run 2 waits
        expect(deps.state.history().at(3)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("running");
        expect(deps.state.history().at(3)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("queued");

        expect(deps.state.history().at(4)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("running");
        expect(deps.state.history().at(4)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("queued");

        expect(deps.state.history().at(5)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("running");
        expect(deps.state.history().at(5)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("queued");

        expect(deps.state.history().at(6)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committing");
        expect(deps.state.history().at(6)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("queued");

        expect(deps.state.history().at(7)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committing");
        expect(deps.state.history().at(7)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("queued");

        expect(deps.state.history().at(8)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(8)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("queued");

        // By the time it's committed, run 1's agent, collect and commit steps have each been timed.
        expect(deps.state.history().at(8)!.run.timings).toMatchInlineSnapshot(`
          {
            "agent": {
              "count": 1,
              "maxMs": 0,
              "totalMs": 0,
            },
            "collect": {
              "count": 1,
              "maxMs": 0,
              "totalMs": 0,
            },
            "commit": {
              "count": 1,
              "maxMs": 0,
              "totalMs": 0,
            },
          }
        `)
        // 9-14: then run 2 does the same
        expect(deps.state.history().at(9)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(9)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("running");

        expect(deps.state.history().at(10)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(10)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("running");

        expect(deps.state.history().at(11)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(11)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("running");

        expect(deps.state.history().at(12)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(12)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("committing");

        expect(deps.state.history().at(13)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(13)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("committing");

        expect(deps.state.history().at(14)!.run.runs["01exec-oooooooo-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(14)!.run.runs["01exec-xxxxxxxx-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(8)!.run.timings).toMatchInlineSnapshot(`
          {
            "agent": {
              "count": 1,
              "maxMs": 0,
              "totalMs": 0,
            },
            "collect": {
              "count": 1,
              "maxMs": 0,
              "totalMs": 0,
            },
            "commit": {
              "count": 1,
              "maxMs": 0,
              "totalMs": 0,
            },
          }
        `)
        // 15: the execution recorded as complete
        expect(deps.state.history().at(15)!.run.execution?.status).toBe("complete");


        // The run data store has the execution, complete, and a record of each run.
        expect(await deps.runStore.listExecutions()).toMatchObject([{ executionId: "01exec", status: "complete", matrix: { permutations: 2, iterations: 1 } }]);
        expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([{ permutation: 1 }, { permutation: 2 }]);
    });

    it("2 permutations × 3 iterations: runs all 6, each permutation's iterations in turn", async () => {
        const deps = fakes();
        const testCase = config({ permutationCount: 2, iterations: 3 });
        testCase.permutations[0]!.permutation.hash = "o".repeat(64);
        testCase.permutations[1]!.permutation.hash = "x".repeat(64);
        for (const permutation of testCase.permutations) {
            permutation.harness = { ...permutation.harness, collectReply: (result) => JSON.parse(result).reply };
        }
        // Containers are named -<permutation>-<iteration>.
        for (const container of ["-1-1", "-1-2", "-1-3", "-2-1", "-2-2", "-2-3"]) {
            deps.runtimeDocker.onRun(container, () => ({
                files: {
                    "/thunderjar/run.json": JSON.stringify({ startedAt: 1_000_001_000_000, finishedAt: 1_000_001_000_000, exitCode: 0 }),
                    "/thunderjar/result.json": JSON.stringify({ reply: "Done: isPrime(7) is true." }),
                },
            }));
        }
        const manifest = plan(testCase, { concurrency: 1, executionId: "01exec" });

        const records = await runManifest(manifest, testCase, deps);

        // Every run completed: each permutation's 3 iterations, then the next permutation's.
        expect(records.map(({ runId, outcome }) => `${runId} ${outcome}`)).toEqual([
            "01exec-oooooooo-i1 completed",
            "01exec-oooooooo-i2 completed",
            "01exec-oooooooo-i3 completed",
            "01exec-xxxxxxxx-i1 completed",
            "01exec-xxxxxxxx-i2 completed",
            "01exec-xxxxxxxx-i3 completed",
        ]);

        // The state at the end. toMatchObject ignores what isn't listed, such as each run's full record.
        expect(deps.state.get().run).toMatchObject({
            execution: {
                executionId: "01exec",
                status: "complete",
                matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 3 },
            },
            images: {},
            runs: {
                "01exec-oooooooo-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-oooooooo-i2": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-oooooooo-i3": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-xxxxxxxx-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-xxxxxxxx-i2": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-xxxxxxxx-i3": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
            },
            timings: {
                agent: { count: 6, maxMs: 0, totalMs: 0 },
                collect: { count: 6, maxMs: 0, totalMs: 0 },
                commit: { count: 6, maxMs: 0, totalMs: 0 },
            },
            uploadBacklog: 0,
        });

        // 40 updates: the empty state, all queued, running, 6 for each of the 6 runs, then complete.
        expect(deps.state.history()).toHaveLength(1 + 1 + 1 + 6 * 6 + 1);
    });
});
