// A line that's written when something slow starts, and finished when it ends, e.g.
// `Building <image> ... done`. On a terminal, how long it has been waiting counts up after the
// label, once a second, until it's finished. Anywhere else, e.g. a pipe or a file, nothing is
// written in between, so the output is the same as it always was.

import { painter } from "./colour.ts";
import { textOutput } from "./textOutput.ts";

/** Where a waiting line is written: `process.stdout`, or a stand-in for it in tests. */
export type LineOutput = { isTTY?: boolean; write(text: string): unknown };

/** Calls `tick` repeatedly until the function it returns is called. */
export type Ticker = (tick: () => void) => () => void;

export type WaitingLine = {
  /**
   * Ends the line with `text`, e.g. `done`, in place of the count. A transient line is replaced
   * by `text` altogether.
   */
  finish(text: string): void;
  /** Ends the line with `failed`. A transient line that was never written stays unwritten. */
  fail(): void;
  /** Stops counting, leaving the line as it is. For an error that's reported some other way. */
  stop(): void;
};

export type WaitingLineOptions = {
  /**
   * Whether the line is only there while it waits: on a terminal, what it's finished with replaces
   * all of it, and anywhere else the label is never written. For a step whose result is a line of
   * its own, e.g. a container run's measures. Its label must be shorter than the terminal is wide.
   */
  transient?: boolean;
  out?: LineOutput;
  ticker?: Ticker;
  now?: () => number;
  /** Whether to colour the count and `failed`. By default, if `out` should be coloured. */
  colour?: boolean;
};

/** Once a second, without keeping the process alive. */
const everySecond: Ticker = (tick) => {
  const timer = setInterval(tick, 1000);
  timer.unref();
  return () => clearInterval(timer);
};

/** How long a line has waited: `7s`, `1m 05s`, `1h 02m 05s`. */
export function elapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return m > 0 ? `${m}m ${pad(s)}s` : `${s}s`;
}

/**
 * Writes `label`, e.g. `Building <image> ... `, and, on a terminal, counts how long it has waited
 * after it until it's finished.
 */
export function waitingLine(label: string, options: WaitingLineOptions = {}): WaitingLine {
  const { transient = false, out = textOutput(), ticker = everySecond, now = Date.now } = options;
  const paint = painter(out, options.colour);
  if (!out.isTTY) {
    if (!transient) out.write(label);
    return {
      finish: (text) => void out.write(`${text}\n`),
      fail: () => void (transient || out.write(`${paint.red("failed")}\n`)),
      stop: () => {},
    };
  }

  out.write(label);
  const startedAt = now();
  // The count shown, without its colour, so its length is how far to move back over it.
  let count = "";
  // Moves back over the count and clears it, so the label is never rewritten: it may have wrapped.
  const erase = () => (count === "" ? "" : `\x1b[${count.length}D\x1b[K`);
  const show = () => {
    const next = elapsed(now() - startedAt);
    out.write(`${erase()}${paint.dim(next)}`);
    count = next;
  };
  show();
  const stop = ticker(show);
  const end = (text: string) => {
    stop();
    out.write(`${erase()}${text}\n`);
    count = "";
  };
  return {
    // A transient line is cleared from its start.
    finish: (text) => (transient ? end(`\r\x1b[2K${text}`) : end(text)),
    fail: () => end(paint.red("failed")),
    stop,
  };
}
