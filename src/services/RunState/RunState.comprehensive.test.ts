import { describe, expect, test } from "bun:test";
import { createRunStateStore, emptyRunState, setImageStatus, setRunStatus, setUploadBacklog } from "./RunState";

describe(setRunStatus, () => {
    test("It changes only the named run, sharing the others", () => {
        const start = setRunStatus(setRunStatus(emptyRunState(), "a", "queued"), "b", "queued");

        const next = setRunStatus(start, "a", "crashed");

        expect(next.runs).toEqual({ a: { status: "crashed" }, b: { status: "queued" } });
        expect(next.runs.b).toBe(start.runs.b);
        expect(start.runs.a?.status).toBe("queued");
    });
});

describe(setImageStatus, () => {
    test("It sets one image's build status", () => {
        expect(setImageStatus(emptyRunState(), "img:1", "ready").images).toEqual({ "img:1": "ready" });
    });
});

describe(setUploadBacklog, () => {
    test("It sets the backlog", () => {
        expect(setUploadBacklog(emptyRunState(), 3).uploadBacklog).toBe(3);
    });
});

describe(createRunStateStore, () => {
    test("It starts from the initial state given, with a manifest", () => {
        const initial = { ...emptyRunState<{ executionId: string }>(), manifest: { executionId: "E1" } };
        const state = createRunStateStore(initial);

        state.update((s) => setRunStatus(s, "E1-p-i1", "uploading"));

        expect(state.get().manifest).toEqual({ executionId: "E1" });
        expect(initial.runs).toEqual({});
    });
});
