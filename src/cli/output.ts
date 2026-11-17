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

// What a command reports to its user: its results on stdout (or, with `--json`, its text on stderr
// and its JSON alone on stdout), and its errors and warnings on
// stderr, coloured on a terminal (see colour.ts). Not the diagnostic log, which is
// src/log/logger.ts and goes to a file.
//
import { painter } from "./colour.ts";
import { textOutput } from "./textOutput.ts";

// Every command writes through here, never with `console`: the lint rule `no-console` bans it.

/** Writes `line` on stdout, or on stderr with `--json`. */
export function print(line: string): void {
  textOutput().write(`${line}\n`);
}

/** Writes `value` on stdout as indented JSON, for `--json`. */
export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Writes `message` to stderr after `Error:`, which is bold red on a terminal. */
export function printError(message: string): void {
  process.stderr.write(`${painter(process.stderr).error("Error:")} ${message}\n`);
}

/** Writes `message` to stderr after `Warning:`, which is yellow on a terminal. */
export function printWarning(message: string): void {
  process.stderr.write(`${painter(process.stderr).yellow("Warning:")} ${message}\n`);
}
