/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// The terminal, as a service: where a command writes. Code that writes takes an Io, so a test can
// give it a FakeIo (src/fakes/fakeIo.ts) and read what was written. `processIo` is the real one, and
// the only place in src/ that writes to the process's streams.
//
// stdout and stderr are separate, each with its own `isTTY`: with `run x --json > out.json`,
// stdout is a file and stderr still a terminal.

/** Somewhere a command writes text. */
export type Output = {
  /** Whether it's a terminal, so can be redrawn and coloured. */
  readonly isTTY: boolean;
  /** How wide the terminal is, if it is one. */
  readonly columns?: number;
  write(text: string): void;
};

/** A signal asking the command to stop: Ctrl-C, or e.g. a cancelled CI job. */
export type StopSignal = "SIGINT" | "SIGTERM";

export interface Io {
  readonly stdout: Output;
  readonly stderr: Output;
  /**
   * Calls `handler` each time the command is asked to stop, in place of the default, which ends
   * the process. Returns the function that stops listening.
   */
  onStop(handler: (signal: StopSignal) => void): () => void;
}

/** `stream` as an Output, reading `isTTY` and `columns` each time, since a terminal can be resized. */
const outputOf = (stream: () => NodeJS.WriteStream): Output => ({
  get isTTY() {
    return stream().isTTY === true;
  },
  get columns() {
    return stream().columns;
  },
  write: (text) => void stream().write(text),
});

/** The process's own stdout and stderr. */
export function processIo(): Io {
  return {
    stdout: outputOf(() => process.stdout),
    stderr: outputOf(() => process.stderr),
    onStop(handler) {
      const onInt = () => handler("SIGINT");
      const onTerm = () => handler("SIGTERM");
      process.on("SIGINT", onInt);
      process.on("SIGTERM", onTerm);
      return () => {
        process.off("SIGINT", onInt);
        process.off("SIGTERM", onTerm);
      };
    },
  };
}
