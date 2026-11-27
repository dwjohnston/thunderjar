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

// Turns each Ctrl+C into the next of two abort signals. See
// project-md/human-safe-space/refactor-work/interrupts.md.
import type { Io, StopSignal } from "../Io/Io.ts";

/**
 * Two signals, each aborted once. Their `reason` is the StopSignal that aborted them, so a command
 * can pick its exit code: 130 for SIGINT, 143 for SIGTERM.
 */
export interface Interrupts {
  /** The 1st Ctrl+C: finish what has started, start nothing new. */
  readonly windDown: AbortSignal;
  /** The 2nd Ctrl+C, or SIGTERM: stop everything now. SIGTERM aborts `windDown` too. */
  readonly forceQuit: AbortSignal;
  /**
   * Starts listening for SIGINT and SIGTERM. Returns a function that stops.
   *
   * Not on from the start: a SIGINT listener replaces the default exit, so only a command that winds
   * down listens, and only while it runs.
   */
  listen(): () => void;
}

/** What each signal does: SIGINT aborts the next signal, SIGTERM both. Shared by the real one and the fake. */
export class InterruptSwitch {
  private readonly windDownController = new AbortController();
  private readonly forceQuitController = new AbortController();
  readonly windDown = this.windDownController.signal;
  readonly forceQuit = this.forceQuitController.signal;

  receive(signal: StopSignal): void {
    if (signal === "SIGTERM" || this.windDown.aborted) {
      // Aborting one already aborted does nothing, so `windDown` keeps its first reason.
      this.windDownController.abort(signal);
      this.forceQuitController.abort(signal);
    } else {
      this.windDownController.abort(signal);
    }
  }
}

/** Interrupts from `io`'s stop signals. */
export function createInterrupts(io: Pick<Io, "onStop">): Interrupts {
  const signals = new InterruptSwitch();
  return {
    windDown: signals.windDown,
    forceQuit: signals.forceQuit,
    listen: () => io.onStop((signal) => signals.receive(signal)),
  };
}

/** The exit code for an interrupted command: 143 if SIGTERM stopped it, otherwise 130. */
export function interruptedExitCode({ windDown, forceQuit }: Pick<Interrupts, "windDown" | "forceQuit">): number {
  return forceQuit.reason === "SIGTERM" || windDown.reason === "SIGTERM" ? 143 : 130;
}
