import { describe, expect, it } from "bun:test";
import { createRunStateStore, setRunStatus, type RunStateStore } from "./RunState";

/** A lower level: it only writes to the state, never prints. */
function sampleRun(state: RunStateStore, runId: string, outcome: "committed" | "timedOut"): void {
    state.update((s) => setRunStatus(s, runId, "running"));
    state.update((s) => setRunStatus(s, runId, outcome));
}

describe(sampleRun, () => {
    it("leaves the run's final status in the state, for a displayer or a test to read", () => {
        const state = createRunStateStore();

        sampleRun(state, "run-1", "timedOut");

        expect(state.get().runs["run-1"]?.status).toBe("timedOut");
    });
});
