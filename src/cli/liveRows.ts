// Lines at the bottom of a terminal that are rewritten in place, e.g. one for each container run
// going at once, each counting how long its current step has taken. Only for a terminal: what's
// piped or written to a file can't be rewritten, so callers write lines one after another there.

import { painter } from "./colour.ts";
import { textOutput } from "./textOutput.ts";
import { elapsed, type LineOutput, type Ticker } from "./waitingLine.ts";

/** One line of a LiveRows. */
export type LiveRow = {
  /** Shows `text`, then, if `counting`, how long it's been since, counting up. */
  set(text: string, counting?: boolean): void;
  /** Leaves it as it is, for good: once no row above it is still going, it's no longer redrawn. */
  done(): void;
};

export type LiveRows = {
  /** Adds a row under the rest, showing `text`, then, if `counting`, how long it's been since. */
  add(text: string, counting?: boolean): LiveRow;
  /** Stops counting, leaving every row as it is, so what's written next goes under them. */
  stop(): void;
};

export type LiveRowsOptions = {
  /** A terminal, or a stand-in for one in tests. `columns` is how wide it is, to know where lines wrap. */
  out?: LineOutput & { columns?: number };
  ticker?: Ticker;
  now?: () => number;
  /** Whether to dim the counts. By default, if `out` should be coloured. */
  colour?: boolean;
};

/** Once a second, without keeping the process alive. */
const everySecond: Ticker = (tick) => {
  const timer = setInterval(tick, 1000);
  timer.unref();
  return () => clearInterval(timer);
};

type Row = { text: string; since?: number; done: boolean };

export function liveRows(options: LiveRowsOptions = {}): LiveRows {
  const { out = textOutput(), ticker = everySecond, now = Date.now } = options;
  const paint = painter(out, options.colour);
  // The rows still being redrawn: from the first that isn't done.
  let rows: Row[] = [];
  // How many terminal lines they took when last drawn, so how far to move back up over them.
  let drawn = 0;
  let stopped = false;

  const lineOf = (row: Row) => (row.since === undefined ? row.text : `${row.text}${paint.dim(elapsed(now() - row.since))}`);
  // A line wider than the terminal wraps onto more than one.
  const height = (line: string) => (out.columns ? Math.max(1, Math.ceil(Bun.stringWidth(line) / out.columns)) : 1);

  const draw = () => {
    if (stopped) return;
    let text = drawn > 0 ? `\x1b[${drawn}F\x1b[J` : "";
    // Rows that are done, with none above them still going, are written a last time and left.
    while (rows[0]?.done) text += `${(rows.shift() as Row).text}\n`;
    const lines = rows.map(lineOf);
    text += lines.map((line) => `${line}\n`).join("");
    drawn = lines.reduce((sum, line) => sum + height(line), 0);
    out.write(text);
  };
  const stopTicking = ticker(draw);

  return {
    add(text, counting = true) {
      const row: Row = { text, since: counting ? now() : undefined, done: false };
      rows.push(row);
      draw();
      return {
        set(next, counting = false) {
          row.text = next;
          row.since = counting ? now() : undefined;
          draw();
        },
        done() {
          row.since = undefined;
          row.done = true;
          draw();
        },
      };
    },
    stop() {
      if (stopped) return;
      stopTicking();
      draw();
      stopped = true;
      rows = [];
    },
  };
}
