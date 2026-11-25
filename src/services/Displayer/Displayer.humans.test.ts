import { describe, expect, it } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeIo } from "../Io/FakeIo";
import { setImageStatus, setRunStatus, setUploadBacklog, updateRun, type ApplicationStateService } from "../ApplicationState/ApplicationState";
import { FakeApplicationState } from "../ApplicationState/FakeApplicationState";
import { createDisplayerService } from "./Displayer";

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
});
