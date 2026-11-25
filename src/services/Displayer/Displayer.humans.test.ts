import { describe, expect, it } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeIo } from "../Io/FakeIo";
import { setImageStatus, setRunStatus, setUploadBacklog, emptyRunState, updateRun, type ApplicationStateService } from "../ApplicationState/ApplicationState";
import { FakeApplicationState } from "../ApplicationState/FakeApplicationState";
import { createDisplayerService, renderState } from "./Displayer";

/** A lower level: writes to the state, never prints. */
async function sampleExecution(state: ApplicationStateService, clock: FakeClock): Promise<void> {
    state.update(updateRun((s) => setImageStatus(s, "base:1", "building")));
    await clock.advance(1000);
    state.update(updateRun((s) => setRunStatus(setImageStatus(s, "base:1", "ready"), "run-1", "running")));
    await clock.advance(1000);
    state.update(updateRun((s) => setUploadBacklog(setRunStatus(s, "run-1", "committed"), 1)));
}

describe(renderState, () => {
    it("renders a frame from the state alone", () => {
        const state = setUploadBacklog(setImageStatus(setRunStatus(setRunStatus(emptyRunState(), "a", "running"), "b", "timedOut"), "base:1", "ready"), 1);

        expect(renderState(state, 0)).toMatchInlineSnapshot(`
          "Runs: 1 running, 1 timedOut
          Images:
            base:1  ready
          Upload backlog: 1
          "
        `);
    });
});

describe(createDisplayerService, () => {
    it("draws a frame each second while the execution runs, and a final one on stop", async () => {
        const io = new FakeIo({ stdout: "terminal" });
        const clock = new FakeClock();
        const state = new FakeApplicationState();
        const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: undefined });

        displayer.setMode("interactive");
        displayer.start();
        await sampleExecution(state, clock);
        displayer.stop();

        expect(io.stdout.text().split("\x1b[0J").at(-1)).toMatchInlineSnapshot(`
          "Runs: 1 committed
          Images:
            base:1  ready
          Upload backlog: 1
          "
        `);
    });
});
