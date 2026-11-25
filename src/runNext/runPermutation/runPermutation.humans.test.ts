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
import { createUploadQueue } from "../uploadQueue/uploadQueue.ts";
import { runPermutation } from "./runPermutation.ts";

describe(runPermutation, () => {
    it("happy path: runs the container, reads what it left, commits it, records it, and removes the container", async () => {
        const deps = fakes();
        const testCase = config();
        // The harness reads the reply from the container run's result file.
        testCase.permutations[0]!.harness = { ...testCase.permutations[0]!.harness, collectReply: (result) => JSON.parse(result).reply };
        // The container run exits 0 after 31 seconds, and leaves its run.json, a result file and an empty stderr.
        deps.runtimeDocker.onRun("-1-1", () => ({
            files: {
                "/thunderjar/run.json": JSON.stringify({ startedAt: 1_700_000_000_000, finishedAt: 1_700_000_031_000, exitCode: 0 }),
                "/thunderjar/result.json": JSON.stringify({ reply: "Done: isPrime(7) is true." }),
                "/thunderjar/stderr.log": "",
            },
        }));
        const manifest = plan(testCase, { concurrency: 1, executionId: "01exec" });
        const uploads = createUploadQueue(deps.runtimeDocker, deps, 1);

        const record = await runPermutation(manifest.runs[0]!, { manifest, config: testCase }, deps, uploads);

        // It completed, and its times come from the container run's run.json: 31 seconds.
        expect(record).toMatchObject({
            runId: "01exec-oooooooo-i1",
            outcome: "completed",
            startedAt: 1_700_000_000_000,
            finishedAt: 1_700_000_031_000,
            postrunImage: "thunderjar-postrun:01exec-1-1",
        });

        // The record of the container run: how it went, and the reply read from its result file.
        expect(record.containerRun).toMatchObject({
            permutation: 1,
            iteration: 1,
            execution: { exitCode: 0, timedOut: false, timeoutSeconds: 600 },
            harnessResult: '{"reply":"Done: isPrime(7) is true."}',
            harnessStderr: "",
            reply: { outcome: "collected", text: "Done: isPrime(7) is true." },
            // The task has no measurements, so there are no results.
            result: {},
        });

        // What was asked of Docker, in order.
        expect(deps.runtimeDocker.calls).toMatchInlineSnapshot(`
          [
            "run thunderjar-prerun:i1000000 thunderjar-run-01exec-1-1",
            "readFile thunderjar-run-01exec-1-1 /thunderjar/run.json",
            "readFile thunderjar-run-01exec-1-1 /thunderjar/result.json",
            "readFile thunderjar-run-01exec-1-1 /thunderjar/stderr.log",
            "commit thunderjar-run-01exec-1-1 thunderjar-postrun:01exec-1-1",
            "removeContainer thunderjar-run-01exec-1-1",
          ]
        `);

        // Its status in the state, after each update. It starts as nothing: queueing it is runManifest's job.
        expect(deps.state.history().map(({ run }) => run.runs["01exec-oooooooo-i1"]?.status)).toEqual([
            undefined,
            "running",
            "running", // container run timed
            "running", // its files read, and timed
            "committing",
            "committing", // commit timed
            "committed",
        ]);

        // The run data store has the same record.
        expect(await deps.runStore.containerRunsOf("01exec")).toEqual([record.containerRun!]);

        // With no image store, there's nothing to upload.
        expect(uploads.backlog()).toBe(0);
    });
});
