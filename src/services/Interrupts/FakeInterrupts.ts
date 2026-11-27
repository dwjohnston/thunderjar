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

// Interrupts a test presses itself.
import { type Interrupts, InterruptSwitch } from "./Interrupts.ts";

export class FakeInterrupts implements Interrupts {
  private readonly signals = new InterruptSwitch();
  readonly windDown = this.signals.windDown;
  readonly forceQuit = this.signals.forceQuit;
  private listeners = 0;

  /** Ctrl+C: aborts the next signal. */
  press(): void {
    this.signals.receive("SIGINT");
  }

  /** SIGTERM: aborts both. */
  terminate(): void {
    this.signals.receive("SIGTERM");
  }

  listen(): () => void {
    this.listeners++;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.listeners--;
    };
  }

  /** Whether anything is listening: `listen` was called, and its stop function wasn't. */
  get listening(): boolean {
    return this.listeners > 0;
  }
}
