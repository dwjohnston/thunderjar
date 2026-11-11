/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 59b8836a-3b3e-41c0-9575-a82add14e327
 * Supervising engineer: blacksheep-bot
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Colour for what the CLI writes to a terminal. Anywhere else, e.g. a pipe or a file, text is left
// plain, so output that's read by scripts and tests stays the same. `NO_COLOR` turns colour off,
// and `FORCE_COLOR` turns it on, as most CLIs do.

/** Each style's ANSI codes: the one that turns it on, and the one that turns it off. */
const STYLES = {
  bold: [1, 22],
  dim: [2, 22],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
} as const;

type Style = keyof typeof STYLES;

/** Whether text written to `out` should be coloured. */
export function colourFor(out: { isTTY?: boolean } = process.stdout): boolean {
  const { NO_COLOR, FORCE_COLOR, TERM } = process.env;
  if (NO_COLOR !== undefined && NO_COLOR !== "") return false;
  if (FORCE_COLOR !== undefined && FORCE_COLOR !== "" && FORCE_COLOR !== "0") return true;
  return out.isTTY === true && TERM !== "dumb";
}

/** Styles text for one output: `paint.green("done")`, or the text as it is if colour is off. */
export type Paint = ReturnType<typeof painter>;

/** A set of styles for `out`, which colour text only if `out` should be coloured. */
export function painter(out: { isTTY?: boolean } = process.stdout, enabled = colourFor(out)) {
  const style =
    (...styles: Style[]) =>
    (text: string): string =>
      enabled ? styles.reduce((styled, name) => `\x1b[${STYLES[name][0]}m${styled}\x1b[${STYLES[name][1]}m`, text) : text;
  return {
    enabled,
    bold: style("bold"),
    dim: style("dim"),
    red: style("red"),
    green: style("green"),
    yellow: style("yellow"),
    blue: style("blue"),
    magenta: style("magenta"),
    cyan: style("cyan"),
    error: style("bold", "red"),
  };
}
