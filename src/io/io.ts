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

export interface Io {
  readonly stdout: Output;
  readonly stderr: Output;
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
  return { stdout: outputOf(() => process.stdout), stderr: outputOf(() => process.stderr) };
}
