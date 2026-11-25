import { describe, expect, test } from "bun:test";
import { createRunStateStore, setImageStatus, setRunStatus, setUploadBacklog } from "./RunState";

describe(createRunStateStore, () => {
    test("It starts empty, and update replaces the state with what fn returns", () => {
        const state = createRunStateStore();
        expect(state.get()).toEqual({ runs: {}, images: {}, uploadBacklog: 0 });

        state.update((s) => setRunStatus(s, "run-1", "timedOut"));

        expect(state.get().runs["run-1"]?.status).toBe("timedOut");
    });

    test("update never mutates an earlier state", () => {
        const state = createRunStateStore();
        const before = state.get();

        state.update((s) => setUploadBacklog(setImageStatus(setRunStatus(s, "run-1", "running"), "img:1", "building"), 2));

        expect(before).toEqual({ runs: {}, images: {}, uploadBacklog: 0 });
        expect(state.get()).toEqual({ runs: { "run-1": { status: "running" } }, images: { "img:1": "building" }, uploadBacklog: 2 });
    });
});
