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
import { FakeIo } from "../Io/FakeIo.ts";
import { createInterrupts, interruptedExitCode } from "./Interrupts.ts";

describe(createInterrupts, () => {
  test("hears nothing until it listens", () => {
    const io = new FakeIo();
    const interrupts = createInterrupts(io);

    io.interrupt();

    expect(interrupts.windDown.aborted).toBe(false);
  });

  test("the first SIGINT winds down, the second force quits", () => {
    const io = new FakeIo();
    const interrupts = createInterrupts(io);
    interrupts.listen();

    io.interrupt();
    expect([interrupts.windDown.aborted, interrupts.forceQuit.aborted]).toEqual([true, false]);

    io.interrupt();
    expect([interrupts.windDown.aborted, interrupts.forceQuit.aborted]).toEqual([true, true]);
    expect(interruptedExitCode(interrupts)).toBe(130);
  });

  test("SIGTERM aborts both at once", () => {
    const io = new FakeIo();
    const interrupts = createInterrupts(io);
    interrupts.listen();

    io.terminate();

    expect([interrupts.windDown.reason, interrupts.forceQuit.reason]).toEqual(["SIGTERM", "SIGTERM"]);
    expect(interruptedExitCode(interrupts)).toBe(143);
  });

  test("SIGTERM after a SIGINT force quits, with 143", () => {
    const io = new FakeIo();
    const interrupts = createInterrupts(io);
    interrupts.listen();

    io.interrupt();
    io.terminate();

    expect([interrupts.windDown.reason, interrupts.forceQuit.reason]).toEqual(["SIGINT", "SIGTERM"]);
    expect(interruptedExitCode(interrupts)).toBe(143);
  });

  test("its stop function stops it listening", () => {
    const io = new FakeIo();
    const interrupts = createInterrupts(io);
    const stop = interrupts.listen();

    stop();
    io.interrupt();

    expect(interrupts.windDown.aborted).toBe(false);
  });
});
