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

// An Io for tests: what a command writes is kept as text, for the test to read.

import type { Io, Output, StopSignal } from "../io/io.ts";

/** One stream: a pipe by default, or a terminal `columns` wide. */
export class FakeOutput implements Output {
  #text = "";

  constructor(
    readonly isTTY = false,
    readonly columns?: number,
  ) {}

  write(text: string): void {
    this.#text += text;
  }

  /** Everything written, as written, escape codes included. */
  text(): string {
    return this.#text;
  }
}

export type FakeIoOptions = {
  stdout?: "pipe" | "terminal";
  stderr?: "pipe" | "terminal";
  /** How wide a terminal is: 80 by default. */
  columns?: number;
};

/** stdout and stderr, each a pipe unless `options` makes it a terminal. A test asks the command to stop with `stop`. */
export class FakeIo implements Io {
  readonly stdout: FakeOutput;
  readonly stderr: FakeOutput;
  readonly #onStop = new Set<(signal: StopSignal) => void>();

  constructor({ stdout = "pipe", stderr = "pipe", columns = 80 }: FakeIoOptions = {}) {
    const output = (kind: "pipe" | "terminal") => (kind === "terminal" ? new FakeOutput(true, columns) : new FakeOutput());
    this.stdout = output(stdout);
    this.stderr = output(stderr);
  }

  onStop(handler: (signal: StopSignal) => void): () => void {
    this.#onStop.add(handler);
    return () => void this.#onStop.delete(handler);
  }

  /** Asks the command to stop, as Ctrl-C (`SIGINT`) or a cancelled job (`SIGTERM`) would. */
  stop(signal: StopSignal): void {
    for (const handler of this.#onStop) handler(signal);
  }
}
