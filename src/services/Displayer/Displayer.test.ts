import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeIo } from "../Io/FakeIo";
import { setRunStatus, emptyRunState, updateRun } from "../ApplicationState/ApplicationState";
import { FakeApplicationState } from "../ApplicationState/FakeApplicationState";
import { createDisplayerService, renderState } from "./Displayer";

describe(renderState, () => {
    test("Shows counts per run status, image statuses and the upload backlog", () => {
        let state = emptyRunState();
        state = setRunStatus(setRunStatus(state, "a", "running"), "b", "running");
        state = { ...state, images: { "img:1": "ready" }, uploadBacklog: 2 };

        expect(renderState(state, 0)).toBe(
            ["Runs: 2 running", "Images:", "  img:1  ready", "Upload backlog: 2", ""].join("\n"),
        );
    });
});

describe(createDisplayerService, () => {
    test("Interactive on a terminal: a frame each second, then a final one on stop", async () => {
        const io = new FakeIo({ stdout: "terminal" });
        const clock = new FakeClock();
        const state = new FakeApplicationState();
        const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: undefined });

        displayer.setMode("interactive");
        displayer.start();
        await clock.advance(1000);
        state.update(updateRun((s) => setRunStatus(s, "a", "running")));
        await clock.advance(1000);
        displayer.stop();
        const writes = io.stdout.text();
        await clock.advance(5000);

        expect(io.stdout.text()).toBe(writes);
        expect(writes).toContain("Runs: 1 running");
        expect(io.stderr.text()).toBe("");
    });

    test("JSON: says where the logs are on stderr, and the final state on stdout", () => {
        const io = new FakeIo();
        const state = new FakeApplicationState<{ name: string }>({ run: { manifest: { name: "t" }, runs: {}, images: {}, uploadBacklog: 0 } });
        const displayer = createDisplayerService({ state, clock: new FakeClock(), stdout: io.stdout, stderr: io.stderr, logPath: "/l.log" });

        displayer.setMode("json");
        displayer.start();
        displayer.stop();

        expect(io.stderr.text()).toBe("Logs: /l.log\n");
        expect(JSON.parse(io.stdout.text())).toEqual(state.get().run);
    });
});
