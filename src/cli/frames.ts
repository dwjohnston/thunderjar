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


// Draws a command's output from its state: the lines a render function returns for it now.
// Piped, or to a file, lines are only ever added at the end, so each frame writes the lines added
// since the last. On a terminal, each frame rewrites the lines that changed in place, and, while a
// line counts up, it's redrawn once a second on the app's clock.

import type { Output } from "../io/io.ts";
import { type Clock, every } from "../time/clock.ts";

/**
 * A line that isn't finished yet, e.g. `Building <image> ... ` while it builds. Piped, it's written
 * without its newline, so whatever reads the pipe sees it now, and the next frame finishes it in
 * place, e.g. with `done`. On a terminal it's an ordinary line.
 */
export type OpenLine = { open: string };

/** A line of a frame. */
export type Line = string | OpenLine;

export type Frames = {
  /** Draws what the render function returns now. */
  update(): void;
  /** Draws a last time, and stops redrawing. */
  stop(): void;
};

/**
 * Draws what `render(out.isTTY)` returns on `out`, at each `update()`. A renderer for a pipe must
 * only add lines at the end, or finish an open line by adding to its end. `render(false)` is the frame without anything counting: while the
 * terminal's frame differs from it, it's redrawn each second on `clock`.
 */
export function frames(out: Output, render: (terminal: boolean) => Line[], clock: Clock): Frames {
  // The last frame's lines.
  let last: string[] = [];
  // Stops the redraw each second, while one is going.
  let stopTicking: (() => void) | undefined;
  // How many rows a line takes on the terminal: a line wider than it wraps.
  const height = (line: string) => (out.columns ? Math.max(1, Math.ceil(Bun.stringWidth(line) / out.columns)) : 1);

  // Piped: all that's been written, so each frame writes only what it adds.
  let written = "";

  const update = () => {
    if (!out.isTTY) {
      const piped = render(false)
        .map((line) => (typeof line === "string" ? `${line}\n` : line.open))
        .join("");
      if (piped.length > written.length) out.write(piped.slice(written.length));
      written = piped;
      return;
    }
    const lines = render(true).map(text);
    let first = 0;
    while (first < last.length && first < lines.length && lines[first] === last[first]) first++;
    const up = last.slice(first).reduce((rows, line) => rows + height(line), 0);
    const tail = lines.slice(first).map((line) => `${line}\n`).join("");
    if (up > 0 || tail !== "") out.write(`${up > 0 ? `\x1b[${up}F\x1b[J` : ""}${tail}`);
    last = lines;
    // Something counts while the frame isn't the one without counting: redraw it each second.
    const counting = !sameLines(lines, render(false).map(text));
    if (counting && stopTicking === undefined) stopTicking = every(clock, 1000, update);
    if (!counting) stopTimer();
  };
  const stopTimer = () => {
    stopTicking?.();
    stopTicking = undefined;
  };
  return {
    update,
    stop: () => {
      update();
      stopTimer();
    },
  };
}

const text = (line: Line) => (typeof line === "string" ? line : line.open);

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);
