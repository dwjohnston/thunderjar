/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, it } from "bun:test";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { ABANDONED, createRunControl, STOP_SETTLE_MS, settled } from "./runControl.ts";

// The example is a kettle: `boil` is the work, which takes as long as the test says.
const boil = (clock: FakeClock, ms: number) => clock.sleep(ms).then(() => "boiled");

describe("createRunControl", () => {
  it("isn't stopped until told to", async () => {
    const control = createRunControl();
    let stopped = false;
    void control.stopped.then(() => (stopped = true));

    expect(control.shouldStop()).toBe(false);
    control.stop();
    await Promise.resolve();

    expect(control.shouldStop()).toBe(true);
    expect(stopped).toBe(true);
  });

  it("is forced only when told to, and then it is stopped too", async () => {
    const control = createRunControl();
    let forced = false;
    void control.forced.then(() => (forced = true));

    control.stop();
    await Promise.resolve();
    expect(forced).toBe(false);

    control.force();
    await Promise.resolve();
    expect(forced).toBe(true);
    expect(control.shouldStop()).toBe(true);
  });
});

describe("settled", () => {
  it("waits for the work, however long, while nobody asks it to stop", async () => {
    const clock = new FakeClock();
    const waiting = settled(boil(clock, 10 * STOP_SETTLE_MS), createRunControl(), clock);

    await clock.advance(10 * STOP_SETTLE_MS);

    expect(await waiting).toEqual({ value: "boiled" });
  });

  it("gives the work's value if it ends within the settle time after a stop", async () => {
    const clock = new FakeClock();
    const control = createRunControl();
    const waiting = settled(boil(clock, 20_000), control, clock);

    await clock.advance(10_000);
    control.stop();
    await clock.advance(10_000);

    expect(await waiting).toEqual({ value: "boiled" });
  });

  it("gives up on work still going when the settle time after a stop has passed", async () => {
    const clock = new FakeClock();
    const control = createRunControl();
    const started = clock.now();
    const waiting = settled(boil(clock, 600_000), control, clock);

    control.stop();
    await clock.advance(STOP_SETTLE_MS);

    expect(await waiting).toBe(ABANDONED);
    expect(clock.now() - started).toBe(STOP_SETTLE_MS);
  });

  it("gives up at once when forced", async () => {
    const clock = new FakeClock();
    const control = createRunControl();
    const waiting = settled(boil(clock, 600_000), control, clock);

    control.stop();
    await clock.advance(1_000);
    control.force();

    expect(await waiting).toBe(ABANDONED);
  });

  it("rethrows what the work throws", async () => {
    const clock = new FakeClock();

    await expect(settled(Promise.reject(new Error("the kettle broke")), createRunControl(), clock)).rejects.toThrow("the kettle broke");
  });

  it("leaves work it gave up on to fail quietly", async () => {
    const clock = new FakeClock();
    const control = createRunControl();
    const waiting = settled(
      clock.sleep(60_000).then(() => Promise.reject(new Error("the kettle broke"))),
      control,
      clock,
    );

    control.force();
    expect(await waiting).toBe(ABANDONED);
    // Nothing is left unhandled when it fails later.
    await clock.advance(60_000);
  });

  it("leaves no timer behind once the work has ended", async () => {
    const clock = new FakeClock();
    let timers = 0;
    const counting = {
      setTimeout: (callback: () => void, ms: number) => {
        timers++;
        return clock.setTimeout(callback, ms);
      },
      clearTimeout: (handle: Parameters<FakeClock["clearTimeout"]>[0]) => {
        if (handle !== undefined) timers--;
        clock.clearTimeout(handle);
      },
    };
    const control = createRunControl();
    const waiting = settled(boil(clock, 1_000), control, counting);

    control.stop();
    await clock.advance(1_000);
    await waiting;

    expect(timers).toBe(0);
  });
});
