import { describe, expect, test } from "bun:test";
import { SystemClock } from "./Clock";

describe("SystemClock", () => {
    const clock = new SystemClock();
    test("Its timers and sleeps run on real time", async () => {
        const before = clock.now();
        let fired = false;
        let cleared = false;
        clock.setTimeout(() => (fired = true), 5);
        clock.clearTimeout(clock.setTimeout(() => (cleared = true), 5));

        await clock.sleep(20);

        expect(clock.now() - before).toBeGreaterThanOrEqual(15);
        expect({ fired, cleared }).toEqual({ fired: true, cleared: false });
    });
});
