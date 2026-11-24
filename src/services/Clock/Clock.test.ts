import { describe, expect, test } from "bun:test";
import { realClock } from "./Clock";
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

  test("a cleared timer never fires", async () => {
    const clock = new FakeClock();
    let fired = false;
    const handle = clock.setTimeout(() => (fired = true), 100);
    clock.clearTimeout(handle);

    await clock.advance(200);

    expect(fired).toBe(false);
  });

  test("advance settles promises between timers, so chained sleeps each wake at their time", async () => {
    const clock = new FakeClock();
    const woke: number[] = [];
    void (async () => {
      for (let i = 0; i < 3; i++) {
        await clock.sleep(100);
        woke.push(clock.now());
      }
    })();

    await clock.advance(250);

    expect(woke).toEqual([100, 200]);
  });
});

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
