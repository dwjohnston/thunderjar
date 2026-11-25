import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeIo } from "../Io/FakeIo";
import { emptyRunState, setRunStatus, updateRun } from "../ApplicationState/ApplicationState";
import { FakeApplicationState } from "../ApplicationState/FakeApplicationState";
import { createDisplayerService, renderState } from "./Displayer";

const setup = (kind: "terminal" | "pipe" = "terminal", logPath?: string) => {
    const io = new FakeIo({ stdout: kind });
    const clock = new FakeClock();
    const state = new FakeApplicationState();
    const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath });
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
