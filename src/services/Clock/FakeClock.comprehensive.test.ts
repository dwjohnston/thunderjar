import { describe, expect, test } from "bun:test";
import { FakeClock } from "./FakeClock";

describe(FakeClock, () => {
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

    test("A cleared timer never fires", async () => {
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
