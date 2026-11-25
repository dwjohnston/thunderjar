import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeIo } from "../Io/FakeIo";
import { addWarning, emptyRunState, setFailure, setRunStatus, updateRun, type RunState } from "../ApplicationState/ApplicationState";
import { FakeApplicationState } from "../ApplicationState/FakeApplicationState";
import { createDisplayerService, renderState } from "./Displayer";

const setup = (kind: "terminal" | "pipe" = "terminal", logPath?: string, extra: { render?: (state: RunState, now: number) => string; toJson?: (state: RunState) => unknown; columns?: number } = {}) => {
    const io = new FakeIo({ stdout: kind, columns: extra.columns });
    const clock = new FakeClock();
    const state = new FakeApplicationState();
    const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath, render: extra.render, toJson: extra.toJson });
    return { io, clock, state, displayer };
};

describe(renderState, () => {
    test("An empty state says there is nothing yet", () => {
        expect(renderState(emptyRunState(), 0)).toBe("Runs: none\n");
    });

    test("A dry run's state, a manifest alone, shows the manifest", () => {
        expect(renderState({ ...emptyRunState(), manifest: { runs: 3 } }, 0)).toBe('Manifest:\n  {\n    "runs": 3\n  }\nRuns: none\n');
    });

    test("A summary function replaces the manifest's JSON", () => {
        const state = { ...emptyRunState<string[]>(), manifest: ["a", "b"] };
        expect(renderState(state, 0, (m) => `${m.length} runs planned`)).toBe("Manifest: 2 runs planned\nRuns: none\n");
    });

    test("Run statuses are counted in lifecycle order", () => {
        let state = emptyRunState();
        for (const [id, status] of [["a", "crashed"], ["b", "queued"], ["c", "committed"], ["d", "queued"]] as const) state = setRunStatus(state, id, status);
        expect(renderState(state, 0)).toBe("Runs: 2 queued, 1 committed, 1 crashed\n");
    });

    test("A zero backlog isn't shown", () => {
        expect(renderState({ ...emptyRunState(), uploadBacklog: 0 }, 0)).not.toContain("backlog");
    });
});

describe(createDisplayerService, () => {
    test("Interactive is the default mode", async () => {
        const { io, clock, displayer } = setup();
        displayer.start();
        await clock.advance(1000);
        expect(io.stdout.text()).toBe("Runs: none\n");
        displayer.stop();
    });

    test("On a terminal each frame after the first erases the one before", async () => {
        const { io, clock, state, displayer } = setup();
        state.update(updateRun((s) => ({ ...s, uploadBacklog: 1 })));
        displayer.start();
        await clock.advance(2000);
        expect(io.stdout.text()).toBe("Runs: none\nUpload backlog: 1\n\x1b[2A\x1b[0JRuns: none\nUpload backlog: 1\n");
        displayer.stop();
    });

    test("No frame is drawn before the first second", async () => {
        const { io, clock, displayer } = setup();
        displayer.start();
        await clock.advance(999);
        expect(io.stdout.text()).toBe("");
        displayer.stop();
    });

    test("Piped, interactive writes only the final frame, as redrawing can't work", async () => {
        const { io, clock, displayer } = setup("pipe");
        displayer.start();
        await clock.advance(3000);
        expect(io.stdout.text()).toBe("");
        displayer.stop();
        expect(io.stdout.text()).toBe("Runs: none\n");
    });

    test("JSON with no log path writes nothing to stderr, and never polls", async () => {
        const { io, clock, displayer } = setup("terminal");
        displayer.setMode("json");
        displayer.start();
        await clock.advance(3000);
        expect(io.stdout.text()).toBe("");
        expect(io.stderr.text()).toBe("");
        displayer.stop();
        expect(JSON.parse(io.stdout.text())).toEqual(emptyRunState());
    });

    test("Stopping without starting still writes the result", () => {
        const { io, displayer } = setup("pipe");
        displayer.stop();
        expect(io.stdout.text()).toBe("Runs: none\n");
    });
});

describe("renderState with the newer run statuses", () => {
    test("They are counted in lifecycle order too", () => {
        let state = emptyRunState();
        for (const [id, status] of [["a", "cancelled"], ["b", "finished"], ["c", "measuring"], ["d", "running"]] as const) state = setRunStatus(state, id, status);
        expect(renderState(state, 0)).toBe("Runs: 1 running, 1 measuring, 1 finished, 1 cancelled\n");
    });
});

describe("a displayer given its own render", () => {
    const render = (state: RunState, now: number) => `${Object.keys(state.runs).length} runs at ${now}\n`;

    test("It draws that, with the clock's time, in place of the built-in frame", async () => {
        const { io, clock, state, displayer } = setup("terminal", undefined, { render });
        displayer.start();
        state.update(updateRun((s) => setRunStatus(s, "a", "running")));
        await clock.advance(1000);
        expect(io.stdout.text()).toBe("1 runs at 1000\n");
        displayer.stop();
        expect(io.stdout.lastFrame()).toBe("1 runs at 1000\n");
    });

    test("A frame with no newline at its end is given one, so the next frame erases all of it", async () => {
        const { io, clock, displayer } = setup("terminal", undefined, { render: () => "one\ntwo" });
        displayer.start();
        await clock.advance(2000);
        expect(io.stdout.text()).toBe("one\ntwo\n\x1b[2A\x1b[0Jone\ntwo\n");
        displayer.stop();
    });

    test("A line wider than the terminal counts as the rows it wraps onto", async () => {
        const { io, clock, displayer } = setup("terminal", undefined, { render: () => `${"x".repeat(25)}\nshort\n`, columns: 10 });
        displayer.start();
        await clock.advance(2000);
        expect(io.stdout.text()).toContain("\x1b[4A\x1b[0J");
        displayer.stop();
    });

    test("An empty frame writes nothing, not a blank line", async () => {
        const { io, clock, displayer } = setup("terminal", undefined, { render: () => "" });
        displayer.start();
        await clock.advance(2000);
        displayer.stop();
        expect(io.stdout.text()).toBe("");
    });

    test("It isn't used in JSON mode", () => {
        const { io, displayer } = setup("pipe", undefined, { render });
        displayer.setMode("json");
        displayer.stop();
        expect(JSON.parse(io.stdout.text())).toEqual(emptyRunState());
    });
});

describe("a displayer given its own toJson", () => {
    const toJson = (state: RunState) => ({ runs: Object.keys(state.runs) });

    test("JSON mode prints what it returns, and nothing else, on stdout", async () => {
        const { io, clock, state, displayer } = setup("terminal", "/l.log", { toJson });
        displayer.setMode("json");
        displayer.start();
        state.update(updateRun((s) => addWarning(setFailure(setRunStatus(s, "a", "crashed"), "it broke"), "old config")));
        await clock.advance(5000);
        displayer.stop();
        expect(io.stdout.text()).toBe('{\n  "runs": [\n    "a"\n  ]\n}\n');
    });

    test("It isn't used in interactive mode", () => {
        const { io, displayer } = setup("pipe", undefined, { toJson });
        displayer.stop();
        expect(io.stdout.text()).toBe("Runs: none\n");
    });

    test("Returning undefined prints null, so stdout is still JSON", () => {
        const { io, displayer } = setup("pipe", undefined, { toJson: () => undefined });
        displayer.setMode("json");
        displayer.stop();
        expect(io.stdout.text()).toBe("null\n");
    });
});

describe("the failure", () => {
    test("Interactive: stop writes it to stderr, after the final frame", () => {
        const { io, state, displayer } = setup("pipe");
        state.update(updateRun((s) => setFailure(s, "No such test case: x")));
        displayer.stop();
        expect(io.stderr.text()).toBe("Error: No such test case: x\n");
        expect(io.stdout.text()).toBe("Runs: none\n");
    });

    test("JSON: stop writes it to stderr, and stdout is only the JSON", () => {
        const { io, state, displayer } = setup("pipe");
        displayer.setMode("json");
        displayer.start();
        state.update(updateRun((s) => setFailure(s, "Docker isn't running")));
        displayer.stop();
        expect(io.stderr.text()).toBe("Error: Docker isn't running\n");
        expect(JSON.parse(io.stdout.text()).failure).toBe("Docker isn't running");
    });

    test("It isn't written while the command is still going", async () => {
        const { io, clock, state, displayer } = setup("terminal");
        displayer.start();
        state.update(updateRun((s) => setFailure(s, "too soon")));
        await clock.advance(3000);
        expect(io.stderr.text()).toBe("");
        displayer.stop();
        expect(io.stderr.text()).toBe("Error: too soon\n");
    });

    test("No failure, nothing on stderr", () => {
        const { io, displayer } = setup("pipe");
        displayer.stop();
        expect(io.stderr.text()).toBe("");
    });
});

describe("warnings", () => {
    test("Interactive on a terminal: each is written to stderr once, on the draw after it appears", async () => {
        const { io, clock, state, displayer } = setup("terminal");
        displayer.start();
        state.update(updateRun((s) => addWarning(s, "first")));
        await clock.advance(1000);
        expect(io.stderr.text()).toBe("Warning: first\n");

        state.update(updateRun((s) => addWarning(s, "second")));
        await clock.advance(2000);
        expect(io.stderr.text()).toBe("Warning: first\nWarning: second\n");

        displayer.stop();
        expect(io.stderr.text()).toBe("Warning: first\nWarning: second\n");
    });

    test("On a terminal the frame is still redrawn in place when a warning arrives", async () => {
        const { io, clock, state, displayer } = setup("terminal");
        displayer.start();
        await clock.advance(1000);
        state.update(updateRun((s) => addWarning(s, "late")));
        await clock.advance(1000);
        expect(io.stdout.text()).toBe("Runs: none\n\x1b[1A\x1b[0JRuns: none\n");
        await clock.advance(1000);
        expect(io.stdout.text()).toBe("Runs: none\n\x1b[1A\x1b[0JRuns: none\n\x1b[1A\x1b[0JRuns: none\n");
        displayer.stop();
    });

    test("Interactive, piped: all are written at stop, before the failure", () => {
        const { io, state, displayer } = setup("pipe");
        displayer.start();
        state.update(updateRun((s) => setFailure(addWarning(addWarning(s, "one"), "two"), "stopped")));
        displayer.stop();
        expect(io.stderr.text()).toBe("Warning: one\nWarning: two\nError: stopped\n");
    });

    test("JSON: none are written until stop", async () => {
        const { io, clock, state, displayer } = setup("terminal");
        displayer.setMode("json");
        displayer.start();
        state.update(updateRun((s) => addWarning(s, "old config")));
        await clock.advance(3000);
        expect(io.stderr.text()).toBe("");
        displayer.stop();
        expect(io.stderr.text()).toBe("Warning: old config\n");
    });
});

describe("stopping twice", () => {
    test("Interactive: the second stop writes nothing more", () => {
        const { io, state, displayer } = setup("pipe");
        state.update(updateRun((s) => setFailure(addWarning(s, "careful"), "stopped")));
        displayer.stop();
        const [out, err] = [io.stdout.text(), io.stderr.text()];
        displayer.stop();
        expect([io.stdout.text(), io.stderr.text()]).toEqual([out, err]);
    });

    test("JSON: the JSON is printed once", () => {
        const { io, displayer } = setup("pipe");
        displayer.setMode("json");
        displayer.stop();
        displayer.stop();
        expect(io.stdout.text()).toBe(`${JSON.stringify(emptyRunState(), null, 2)}\n`);
    });

    test("Starting after stopping doesn't begin polling again", async () => {
        const { io, clock, displayer } = setup("terminal");
        displayer.stop();
        displayer.start();
        await clock.advance(3000);
        expect(io.stdout.text()).toBe("Runs: none\n");
    });
});
