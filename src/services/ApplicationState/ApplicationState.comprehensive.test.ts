import { describe, expect, test } from "bun:test";
import { createApplicationStateService, emptyApplicationState, emptyRunState, setImageStatus, setRunStatus, setUploadBacklog, updateRun } from "./ApplicationState";

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

describe(createApplicationStateService, () => {
    test("It starts from the initial state given, with a manifest", () => {
        const initial = { run: { ...emptyRunState<{ executionId: string }>(), manifest: { executionId: "E1" } } };
        const state = createApplicationStateService(initial);

        state.update(updateRun((r) => setRunStatus(r, "E1-p-i1", "uploading")));

        expect(state.get().run.manifest).toEqual({ executionId: "E1" });
        expect(initial.run.runs).toEqual({});
    });

    test("updateRun leaves the state's other slices alone", () => {
        const initial = { ...emptyApplicationState(), other: 1 };
        expect(updateRun((r) => r)(initial)).toEqual(initial);
    });
});
