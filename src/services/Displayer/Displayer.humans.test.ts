import { describe, expect, it } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeIo } from "../Io/FakeIo";
import { setImageStatus, setRunStatus, setUploadBacklog, updateRun, type ApplicationStateService } from "../ApplicationState/ApplicationState";
import { FakeApplicationState } from "../ApplicationState/FakeApplicationState";
import { createDisplayerService } from "./Displayer";
import { renderRun } from "../../cli/commands/run/renderRun";
import { plan } from "../../runNext/plan/plan";
import { config } from "../../runNext/testing/fixtures";
import type { Manifest } from "../../runNext/types";

/** A lower level: writes to the state, never prints. */
async function sampleExecution(state: ApplicationStateService, clock: FakeClock): Promise<void> {
    state.update(updateRun((s) => setImageStatus(s, "base:1", "building")));
    await clock.advance(1000);
    state.update(updateRun((s) => setRunStatus(setImageStatus(s, "base:1", "ready"), "run-1", "running")));
    await clock.advance(1000);
    state.update(updateRun((s) => setUploadBacklog(setRunStatus(s, "run-1", "committed"), 1)));
}

describe(createDisplayerService, () => {
    it("in JSON mode, writes the final state as JSON on stop", async () => {
        const io = new FakeIo();
        const clock = new FakeClock();
        const state = new FakeApplicationState();
        const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: undefined });

        displayer.setMode("json");
        displayer.start();
        await sampleExecution(state, clock);
        displayer.stop();

        expect(io.stdout.text()).toMatchInlineSnapshot(`
          "{
            "runs": {
              "run-1": {
                "status": "committed"
              }
            },
            "images": {
              "base:1": "ready"
            },
            "uploadBacklog": 1
          }
          "
        `);
    });

    it("in interactive mode, draws a pretty frame each second and a final one on stop", async () => {
        const io = new FakeIo({ stdout: "terminal" });
        const clock = new FakeClock();
        const state = new FakeApplicationState();
        const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: undefined });

        displayer.setMode("interactive");
        displayer.start();
        await sampleExecution(state, clock);
        displayer.stop();

        expect(io.stdout.lastFrame()).toMatchInlineSnapshot(`
          "Runs: 1 committed
          Images:
            base:1  ready
          Upload backlog: 1
          "
        `);
    });

    it("given this state, shows this frame", () => {
        // An execution partway through: one image ready and one still building, runs at each stage, and 2 images waiting to upload.
        const state = new FakeApplicationState({
            run: {
                images: { "thunderjar-prerun:i1000000": "ready", "thunderjar-prerun:i2000000": "building" },
                runs: {
                    "01exec-oooooooo-i1": { status: "committed" },
                    "01exec-oooooooo-i2": { status: "committing" },
                    "01exec-oooooooo-i3": { status: "running" },
                    "01exec-xxxxxxxx-i1": { status: "queued" },
                    "01exec-xxxxxxxx-i2": { status: "queued" },
                },
                uploadBacklog: 2,
            },
        });
        const io = new FakeIo({ stdout: "terminal" });
        const displayer = createDisplayerService({ state, clock: new FakeClock(), stdout: io.stdout, stderr: io.stderr, logPath: undefined });

        displayer.setMode("interactive");
        displayer.start();
        displayer.stop();

        expect(io.stdout.lastFrame()).toMatchInlineSnapshot(`
          "Runs: 2 queued, 1 running, 1 committing, 1 committed
          Images:
            thunderjar-prerun:i1000000  ready
            thunderjar-prerun:i2000000  building
          Upload backlog: 2
          "
        `);
    });

    it("given a running execution, shows what the run command draws", async () => {
        // 2 permutations × 3 iterations, planned as the run command would.
        const testCase = config({ permutationCount: 2, iterations: 3 });
        testCase.permutations[0]!.permutation.hash = "o".repeat(64);
        testCase.permutations[1]!.permutation.hash = "x".repeat(64);
        const manifest = plan(testCase, { concurrency: 1, executionId: "01exec" });

        // Partway through: both images ready, permutation o's first 2 runs done, its third running for 45 seconds, x's waiting.
        const clock = new FakeClock(1_700_000_000_000);
        const state = new FakeApplicationState<Manifest>({
            run: {
                manifest,
                images: { "thunderjar-prerun:i1000000": "ready", "thunderjar-prerun:i2000000": "ready" },
                runs: {
                    "01exec-oooooooo-i1": { status: "committed", startedAt: 1_699_999_880_000, finishedAt: 1_699_999_910_000 },
                    "01exec-oooooooo-i2": { status: "committed", startedAt: 1_699_999_915_000, finishedAt: 1_699_999_950_000 },
                    "01exec-oooooooo-i3": { status: "running", startedAt: 1_699_999_955_000 },
                    "01exec-xxxxxxxx-i1": { status: "queued" },
                    "01exec-xxxxxxxx-i2": { status: "queued" },
                    "01exec-xxxxxxxx-i3": { status: "queued" },
                },
                uploadBacklog: 0,
            },
        });
        const io = new FakeIo({ stdout: "terminal" });
        // The run command's renderer, in place of the displayer's default.
        const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: undefined, render: (run, now) => renderRun(run, now) });

        displayer.setMode("interactive");
        displayer.start();
        // A second later, the displayer draws a frame: by then the third run has been going 46 seconds.
        await clock.advance(1000);

        expect(io.stdout.lastFrame()).toMatchInlineSnapshot(`
          "Execution 01exec  example
            2 permutations, 6 runs, up to 1 at once

          Images
            thunderjar-prerun:i1000000  ready
            thunderjar-prerun:i2000000  ready

          Runs
            1.1  harness-1/model  completed  0:30
            1.2  harness-1/model  completed  0:35
            1.3  harness-1/model  running 0:46
            2.1  harness-2/model  queued
            2.2  harness-2/model  queued
            2.3  harness-2/model  queued
          "
        `);
        displayer.stop();
    });
});
