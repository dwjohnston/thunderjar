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
import type { Io, Output } from "../io/io.ts";
import { colourFor, type Paint, painter } from "./colour.ts";
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

/**
 * Where a command run through createApp writes: the same as the functions above, but to its `io`,
 * coloured by its environment. Commands move to it from the functions above one by one.
 */
export type Printer = {
  /** Where a command's text goes: `io.stdout`, or `io.stderr` with `--json`. */
  readonly text: Output;
  /** Styles for `text`. */
  readonly paint: Paint;
  /** Writes `line` on `text`. */
  print(line: string): void;
  /** Writes `value` on `io.stdout` as indented JSON, for `--json`. */
  printJson(value: unknown): void;
  /** Writes `message` to `io.stderr` after `Error:`, which is bold red on a terminal. */
  printError(message: string): void;
  /** Writes `message` to `io.stderr` after `Warning:`, which is yellow on a terminal. */
  printWarning(message: string): void;
};

/**
 * The Printer the functions above write with, for commands not yet run through createApp: their
 * text goes to stdout, or to stderr once `--json` has called textToStderr, coloured by the
 * process's environment.
 */
export function processPrinter(): Printer {
  const text: Output = {
    get isTTY() {
      return textOutput().isTTY === true;
    },
    get columns() {
      return textOutput().columns;
    },
    write: (chunk) => void textOutput().write(chunk),
  };
  return {
    text,
    get paint() {
      return painter();
    },
    print,
    printJson,
    printError,
    printWarning,
  };
}

/** A Printer over `io`, with the environment variables `env`, which may turn colour on or off. */
export function printer(io: Io, { json = false, env }: { json?: boolean; env: Record<string, string | undefined> }): Printer {
  const text = json ? io.stderr : io.stdout;
  const errors = painter(io.stderr, colourFor(io.stderr, env));
  return {
    text,
    paint: painter(text, colourFor(text, env)),
    print: (line) => text.write(`${line}\n`),
    printJson: (value) => io.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
    printError: (message) => io.stderr.write(`${errors.error("Error:")} ${message}\n`),
    printWarning: (message) => io.stderr.write(`${errors.yellow("Warning:")} ${message}\n`),
  };
}
