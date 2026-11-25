import { describe, expect, it } from "bun:test";
import { setRunStatus, updateRun, type ApplicationStateService } from "./ApplicationState";
import { FakeApplicationState } from "./FakeApplicationState";

/** A lower level: it only writes to the state, never prints. */
function sampleRun(state: ApplicationStateService, runId: string, outcome: "committed" | "timedOut"): void {
    state.update(updateRun((r) => setRunStatus(r, runId, "running")));
    state.update(updateRun((r) => setRunStatus(r, runId, outcome)));
}

describe(sampleRun, () => {
    it("leaves the run's final status in the state, for a displayer or a test to read", () => {
        const state = new FakeApplicationState();

        sampleRun(state, "run-1", "timedOut");

        expect(state.get().run.runs["run-1"]?.status).toBe("timedOut");
    });

    it("passes through running on the way, which the fake's history shows", () => {
        const state = new FakeApplicationState();

        sampleRun(state, "run-1", "committed");

        expect(state.history().map((s) => s.run.runs["run-1"]?.status)).toEqual([undefined, "running", "committed"]);
    });
});
