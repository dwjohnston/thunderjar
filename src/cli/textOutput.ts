/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhUgVdcFDwxCaPr4NU
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Where a command's text goes: its progress and its human-readable results. Stdout, unless
// `--json` sends it to stderr, so that stdout holds only the JSON. Errors and warnings always go
// to stderr (see output.ts).

/** Somewhere text can be written: stdout, stderr, or a stand-in for them in tests. */
export type TextOutput = { isTTY?: boolean; columns?: number; write(text: string): unknown };

let text: TextOutput = process.stdout;

/** Where a command's text goes: stdout, unless `textToStderr` was called. */
export const textOutput = (): TextOutput => text;

/** Sends a command's text to stderr from now on, so stdout holds only what `printJson` writes. For `--json`. */
export function textToStderr(): void {
  text = process.stderr;
}
