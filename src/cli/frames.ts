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
import type { Clock } from "../time/clock.ts";

export type Frames = {
  /** Draws what the render function returns now. */
  update(): void;
  /** Draws a last time, and stops redrawing. */
  stop(): void;
};

/**
 * Draws what `render(out.isTTY)` returns on `out`, at each `update()`. A renderer for a pipe must
 * only add lines at the end. `render(false)` is the frame without anything counting: while the
 * terminal's frame differs from it, it's redrawn each second on `clock`.
 */
export function frames(_out: Output, _render: (terminal: boolean) => string[], _clock: Clock): Frames {
  return { update: () => {}, stop: () => {} };
}
