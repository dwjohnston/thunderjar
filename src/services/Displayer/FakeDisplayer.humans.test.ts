import { describe, expect, it } from "bun:test";
import type { Displayer } from "./Displayer";
import { FakeDisplayer } from "./FakeDisplayer";

/** A command: shows its progress in the format asked for. */
function sampleCommand(displayer: Displayer, json: boolean): void {
    if (json) displayer.setMode("json");
    displayer.start();
    displayer.stop();
}

/** 
 * 🙋‍♂️ I'm not sure if the FakeDisplayer will ever be helpful 
 */

describe(FakeDisplayer, () => {
    it("records the mode a command set", () => {
        const displayer = new FakeDisplayer();

        sampleCommand(displayer, true);

        expect(displayer.mode).toBe("json");
    });
});
