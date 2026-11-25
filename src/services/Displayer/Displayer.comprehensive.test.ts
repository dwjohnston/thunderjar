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

describe("createDisplayerService with a render function", () => {
    /** A to-do list: what's ticked off is settled, the rest is still live. */
    type Todo = { done: string[]; doing: string[] };

    const setupRender = (options: { stdout?: "terminal" | "pipe"; stderr?: "terminal" | "pipe"; columns?: number; toJson?: (todo: Todo | undefined) => unknown } = {}) => {
        const io = new FakeIo({ stdout: options.stdout ?? "terminal", stderr: options.stderr ?? "pipe", columns: options.columns });
        const clock = new FakeClock();
        const state = new FakeApplicationState<Todo>();
        const { toJson } = options;
        const displayer = createDisplayerService<Todo>({
            state,
            clock,
            stdout: io.stdout,
            stderr: io.stderr,
            logPath: undefined,
            render: ({ manifest }, now) => ({
                settled: (manifest?.done ?? []).map((item) => `${item}: done\n`).join(""),
                live: (manifest?.doing ?? []).map((item) => `${item}: ${now / 1000}s\n`).join(""),
            }),
            ...(toJson && { toJson: (run) => toJson(run.manifest) }),
        });
        const set = (done: string[], doing: string[]) => state.update(updateRun((s) => ({ ...s, manifest: { done, doing } })));
        return { io, clock, displayer, set };
    };

    test("On a terminal, what's settled is written once, and the live block under it is redrawn each second", async () => {
        const { io, clock, displayer, set } = setupRender();
        displayer.start();
        set([], ["milk", "eggs"]);
        await clock.advance(1000);
        expect(io.stdout.text()).toBe("milk: 1s\neggs: 1s\n");

        set(["milk"], ["eggs"]);
        await clock.advance(1000);
        expect(io.stdout.text()).toBe("milk: 1s\neggs: 1s\n\x1b[2A\x1b[0Jmilk: done\neggs: 2s\n");

        await clock.advance(1000);
        expect(io.stdout.text()).toEndWith("eggs: 2s\n\x1b[1A\x1b[0Jeggs: 3s\n");
        displayer.stop();
    });

    test("On a terminal, stop writes the rest of what's settled and leaves no live block", async () => {
        const { io, clock, displayer, set } = setupRender();
        displayer.start();
        set(["milk"], ["eggs", "tea"]);
        await clock.advance(1000);
        set(["milk", "eggs"], ["tea"]);
        displayer.stop();

        expect(io.stdout.text()).toBe("milk: done\neggs: 1s\ntea: 1s\n\x1b[2A\x1b[0Jeggs: done\n");
    });

    test("A live line wider than the terminal is erased by the rows it takes", async () => {
        const { io, clock, displayer, set } = setupRender({ columns: 10 });
        displayer.start();
        set([], ["a rather long item"]);
        await clock.advance(2000);

        expect(io.stdout.text()).toBe("a rather long item: 1s\n\x1b[3A\x1b[0Ja rather long item: 2s\n");
        displayer.stop();
    });

    test("Piped, only what's newly settled is written, each second and on stop, and never the live block", async () => {
        const { io, clock, displayer, set } = setupRender({ stdout: "pipe" });
        displayer.start();
        set(["milk"], ["eggs"]);
        await clock.advance(1000);
        expect(io.stdout.text()).toBe("milk: done\n");

        await clock.advance(1000);
        expect(io.stdout.text()).toBe("milk: done\n");

        set(["milk", "eggs"], ["tea"]);
        displayer.stop();
        expect(io.stdout.text()).toBe("milk: done\neggs: done\n");
    });

    test("Nothing is written while the frame is empty", async () => {
        const { io, clock, displayer } = setupRender();
        displayer.start();
        await clock.advance(2000);
        displayer.stop();

        expect(io.stdout.text()).toBe("");
    });

    test("In JSON mode the progress goes to stderr, and stdout is the JSON alone", async () => {
        const { io, clock, displayer, set } = setupRender({ stdout: "pipe", stderr: "terminal", toJson: (todo) => ({ bought: todo?.done }) });
        displayer.setMode("json");
        displayer.start();
        set(["milk"], ["eggs"]);
        await clock.advance(1000);
        expect(io.stderr.text()).toBe("milk: done\neggs: 1s\n");
        expect(io.stdout.text()).toBe("");

        set(["milk", "eggs"], []);
        displayer.stop();
        expect(io.stderr.text()).toBe("milk: done\neggs: 1s\n\x1b[1A\x1b[0Jeggs: done\n");
        expect(io.stdout.text()).toBe('{\n  "bought": [\n    "milk",\n    "eggs"\n  ]\n}\n');
    });

    test("In JSON mode with stderr piped, only what's settled goes to stderr", async () => {
        const { io, clock, displayer, set } = setupRender({ stdout: "terminal", stderr: "pipe" });
        displayer.setMode("json");
        displayer.start();
        set(["milk"], ["eggs"]);
        await clock.advance(1000);

        expect(io.stderr.text()).toBe("milk: done\n");
        displayer.stop();
    });

    test("Without toJson, JSON mode prints the run state", () => {
        const { io, displayer, set } = setupRender({ stdout: "pipe" });
        displayer.setMode("json");
        set(["milk"], []);
        displayer.stop();

        expect(JSON.parse(io.stdout.text())).toEqual({ ...emptyRunState(), manifest: { done: ["milk"], doing: [] } });
    });

    test("When toJson gives undefined, nothing is written to stdout", () => {
        const { io, displayer, set } = setupRender({ stdout: "pipe", toJson: () => undefined });
        displayer.setMode("json");
        set(["milk"], []);
        displayer.stop();

        expect(io.stdout.text()).toBe("");
        expect(io.stderr.text()).toBe("milk: done\n");
    });

    test("Stopping twice writes once", async () => {
        const { io, clock, displayer, set } = setupRender({ stdout: "pipe", toJson: (todo) => todo?.done });
        displayer.setMode("json");
        displayer.start();
        set(["milk"], []);
        displayer.stop();
        const [out, err] = [io.stdout.text(), io.stderr.text()];
        displayer.stop();
        await clock.advance(3000);

        expect(io.stdout.text()).toBe(out);
        expect(io.stderr.text()).toBe(err);
        expect(out).toBe('[\n  "milk"\n]\n');
    });
});

describe("createDisplayerService without a render function", () => {
    test("Stopping twice writes the final frame once", () => {
        const { io, displayer } = setup("pipe");
        displayer.stop();
        displayer.stop();
        expect(io.stdout.text()).toBe("Runs: none\n");
    });
});
