/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhpmETxGQ7SW8synkm
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// What a command reports to its user: plain lines, its results on stdout and its errors on stderr.
// Not the diagnostic log, which is src/log/logger.ts.
//
// Every command writes through here, never with `console`: the lint rule `no-console` bans it.

/** Writes `text` as a line on stdout. */
export function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** Writes `text` as a line on stderr. */
export function printError(text: string): void {
  process.stderr.write(`${text}\n`);
}
