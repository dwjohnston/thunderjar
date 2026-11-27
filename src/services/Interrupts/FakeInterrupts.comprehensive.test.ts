/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import type { Interrupts } from "./Interrupts.ts";
import { FakeInterrupts } from "./FakeInterrupts.ts";

/** Counts to `to`, one a tick, stopping early once asked to wind down. */
async function count(to: number, { windDown }: Pick<Interrupts, "windDown">, onTick: (n: number) => void): Promise<number> {
  let n = 0;
  while (n < to && !windDown.aborted) {
    n++;
    onTick(n);
    await Promise.resolve();
  }
  return n;
}

describe(FakeInterrupts, () => {
  test("never pressed, nothing is interrupted", async () => {
    const interrupts = new FakeInterrupts();

    const counted = await count(10, interrupts, () => {});

    expect(counted).toBe(10);
    expect([interrupts.windDown.aborted, interrupts.forceQuit.aborted]).toEqual([false, false]);
  });

  test("press() winds down first", async () => {
    const interrupts = new FakeInterrupts();

    const counted = await count(10, interrupts, (n) => n === 3 && interrupts.press());

    expect(counted).toBe(3);
    expect(interrupts.forceQuit.aborted).toBe(false);
  });

  test("a second press() force quits", () => {
    const interrupts = new FakeInterrupts();

    interrupts.press();
    interrupts.press();

    expect([interrupts.windDown.reason, interrupts.forceQuit.reason]).toEqual(["SIGINT", "SIGINT"]);
  });

  test("terminate() aborts both", () => {
    const interrupts = new FakeInterrupts();

    interrupts.terminate();

    expect([interrupts.windDown.reason, interrupts.forceQuit.reason]).toEqual(["SIGTERM", "SIGTERM"]);
  });

  test("listening lasts until the stop function is called", () => {
    const interrupts = new FakeInterrupts();

    const stop = interrupts.listen();
    expect(interrupts.listening).toBe(true);

    stop();
    expect(interrupts.listening).toBe(false);
  });
});
