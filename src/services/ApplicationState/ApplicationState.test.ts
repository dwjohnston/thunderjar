import { describe, expect, test } from "bun:test";
import { createApplicationStateService, emptyApplicationState, setImageStatus, setRunStatus, setUploadBacklog, updateRun } from "./ApplicationState";

describe(createApplicationStateService, () => {
    test("It starts empty, and update replaces the state with what fn returns", () => {
        const state = createApplicationStateService();
        expect(state.get()).toEqual({ run: { runs: {}, images: {}, uploadBacklog: 0 } });

        state.update(updateRun((r) => setRunStatus(r, "run-1", "timedOut")));

        expect(state.get().run.runs["run-1"]?.status).toBe("timedOut");
    });

    test("update never mutates an earlier state", () => {
        const state = createApplicationStateService();
        const before = state.get();

        state.update(updateRun((r) => setUploadBacklog(setImageStatus(setRunStatus(r, "run-1", "running"), "img:1", "building"), 2)));

        expect(before).toEqual(emptyApplicationState());
        expect(state.get().run).toEqual({ runs: { "run-1": { status: "running" } }, images: { "img:1": "building" }, uploadBacklog: 2 });
    });
});
