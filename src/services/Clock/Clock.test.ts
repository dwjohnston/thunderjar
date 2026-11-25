import { describe, expect, test } from "bun:test";
import { realClock } from "./Clock";

describe("realClock", () => {
  test("its timers and sleeps run on real time", async () => {
    const before = realClock.now();
    let fired = false;
    let cleared = false;
    realClock.setTimeout(() => (fired = true), 5);
    realClock.clearTimeout(realClock.setTimeout(() => (cleared = true), 5));

    await realClock.sleep(20);

    expect(realClock.now() - before).toBeGreaterThanOrEqual(15);
    expect({ fired, cleared }).toEqual({ fired: true, cleared: false });
  });
});
