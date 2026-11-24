import { describe, expect, test } from "bun:test";
import { FakeClock } from "./FakeClock";

describe("FakeClock", () => {
  test("advance fires due timers in time order, at their time", async () => {
    const clock = new FakeClock(1000);
    const fired: [string, number][] = [];
    clock.setTimeout(() => fired.push(["late", clock.now()]), 300);
    clock.setTimeout(() => fired.push(["early", clock.now()]), 100);
    clock.setTimeout(() => fired.push(["never", clock.now()]), 500);

    await clock.advance(400);

    expect(fired).toEqual([["early", 1100], ["late", 1300]]);
    expect(clock.now()).toBe(1400);
  });
});
