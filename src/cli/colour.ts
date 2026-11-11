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

/** Styles that leave text as it is: the default for anything that renders output, e.g. in tests. */
export const plain = painter({}, false);

/** `text` without its colour codes. */
// oxlint-disable-next-line no-control-regex -- matching the escape character is the point.
export const unstyled = (text: string) => text.replace(/\x1b\[\d+m/g, "");

/** How wide `text` is on a terminal: its length without colour codes. */
export const visibleLength = (text: string) => unstyled(text).length;

/** `text` padded with spaces on the right to `width`, not counting its colour codes. */
export const padEnd = (text: string, width: number) => text + " ".repeat(Math.max(0, width - visibleLength(text)));

/** `text` padded with spaces on the left to `width`, not counting its colour codes. */
export const padStart = (text: string, width: number) => " ".repeat(Math.max(0, width - visibleLength(text))) + text;

/** Writes `message` to stderr after `Error:`, which is bold red on a terminal. */
export const printError = (message: string) => console.error(`${painter(process.stderr).error("Error:")} ${message}`);

/** Writes `message` to stderr after `Warning:`, which is yellow on a terminal. */
export const printWarning = (message: string) => console.error(`${painter(process.stderr).yellow("Warning:")} ${message}`);
