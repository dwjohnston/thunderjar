import { describe, expect, test } from "bun:test";
import { addNote, addWarning, createApplicationStateService, emptyApplicationState, emptyRunState, patchRun, recordTiming, setFailure, setImageStatus, setPhase, setRunStatus, setUploadBacklog, updateRun, type RunStatus } from "./ApplicationState";

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

describe(patchRun, () => {
    test("It changes only the fields given, keeping the run's others", () => {
        const start = patchRun(setRunStatus(emptyRunState(), "a", "running"), "a", { startedAt: 1_000 });

        const next = patchRun(start, "a", { status: "finished", finishedAt: 61_000, outcome: "done", costUsd: 0.25, tokens: 1200, measures: { tests: "pass" } });

        expect(next.runs.a).toEqual({ status: "finished", startedAt: 1_000, finishedAt: 61_000, outcome: "done", costUsd: 0.25, tokens: 1200, measures: { tests: "pass" } });
        expect(start.runs.a).toEqual({ status: "running", startedAt: 1_000 });
    });

    test("It leaves the other runs as they were, sharing them", () => {
        const start = setRunStatus(setRunStatus(emptyRunState(), "a", "queued"), "b", "queued");

        const next = patchRun(start, "a", { status: "crashed", error: "it fell over", hint: "look at the logs" });

        expect(next.runs.a).toEqual({ status: "crashed", error: "it fell over", hint: "look at the logs" });
        expect(next.runs.b).toBe(start.runs.b);
    });

    test("A run not seen before starts queued", () => {
        expect(patchRun(emptyRunState(), "new", { outcome: "exited 2" }).runs.new).toEqual({ status: "queued", outcome: "exited 2" });
    });

    test("Every status a run can have is accepted", () => {
        const statuses: RunStatus[] = ["queued", "running", "committing", "committed", "measuring", "uploading", "uploaded", "finished", "crashed", "timedOut", "cancelled"];

        const state = statuses.reduce((s, status) => setRunStatus(s, status, status), emptyRunState());

        expect(Object.values(state.runs).map((run) => run.status)).toEqual(statuses);
    });
});

describe(setPhase, () => {
    test("It sets the phase, and nothing else", () => {
        const start = setRunStatus(emptyRunState(), "a", "queued");

        expect(setPhase(start, "building")).toEqual({ ...start, phase: "building" });
        expect(start.phase).toBeUndefined();
    });
});

describe(addWarning, () => {
    test("Warnings are kept in the order they were added", () => {
        const state = addWarning(addWarning(emptyRunState(), "first"), "second");

        expect(state.warnings).toEqual(["first", "second"]);
    });

    test("The same warning twice is kept once", () => {
        const once = addWarning(emptyRunState(), "careful");

        expect(addWarning(once, "careful")).toBe(once);
    });
});

describe(addNote, () => {
    test("Notes are kept in the order they were added, repeats included", () => {
        const state = addNote(addNote(addNote(emptyRunState(), "one"), "two"), "one");

        expect(state.notes).toEqual(["one", "two", "one"]);
        expect(state.warnings).toBeUndefined();
    });
});

describe(setFailure, () => {
    test("It keeps the message of what stopped the command", () => {
        expect(setFailure(emptyRunState(), "No such test case: x").failure).toBe("No such test case: x");
    });
});

describe(recordTiming, () => {
    test("It counts each phase's times, their total and their longest", () => {
        let state = recordTiming(emptyRunState(), "build", 300);
        state = recordTiming(state, "build", 500);
        state = recordTiming(state, "agent", 40);

        expect(state.timings).toEqual({ wallMs: 0, phases: { build: { count: 2, totalMs: 800, maxMs: 500 }, agent: { count: 1, totalMs: 40, maxMs: 40 } } });
    });

    test("It keeps the wall time already set", () => {
        const start = { ...emptyRunState(), timings: { wallMs: 9_000, phases: {} } };

        expect(recordTiming(start, "build", 1).timings?.wallMs).toBe(9_000);
        expect(start.timings.phases).toEqual({});
    });
});

describe("the fields a command sets once", () => {
    test("They are plain optional fields of the run state", () => {
        const state = createApplicationStateService();

        state.update(updateRun((r) => ({ ...r, executionId: "E1", recordedIn: "/data/runs.sqlite", result: { ok: true }, exitCode: 1 })));

        expect(state.get().run).toEqual({ runs: {}, images: {}, uploadBacklog: 0, executionId: "E1", recordedIn: "/data/runs.sqlite", result: { ok: true }, exitCode: 1 });
    });
});
