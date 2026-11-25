import { describe, expect, it } from "bun:test";
import type { Displayer } from "./Displayer";
import { FakeDisplayer } from "./FakeDisplayer";

/** A command: shows its progress in the format asked for. */
function sampleCommand(displayer: Displayer, json: boolean): void {
    if (json) displayer.setMode("json");
    displayer.start();
    displayer.stop();
}

describe(FakeDisplayer, () => {
    it("records the mode a command set, and that it started and stopped the display", () => {
        const displayer = new FakeDisplayer();

        sampleCommand(displayer, true);

        expect(displayer.mode).toBe("json");
        expect(displayer.calls).toEqual(["setMode json", "start", "stop"]);
    });
});
