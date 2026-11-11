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

// Thunderjar's diagnostic log: what it's doing and why, for whoever is debugging a run. Not its
// output: what a command reports to the user goes through src/cli/output.ts.
//
// A pino logger, for its levels, written as readable lines to a file, never the terminal: a
// command's output on the terminal is redrawn in place, which lines written in between would
// garble. Where the file is, and how much goes in it, are set once the command is known, with
// `configureLog`. Until then, nothing is logged. A line looks like:
//
//   [06:07:11.711] DEBUG: docker: listing images
//       repository: "thunderjar-prerun"
import pino from "pino";
import { prettyFactory } from "pino-pretty";

export const LOG_LEVELS = ["silent", "fatal", "error", "warn", "info", "debug", "trace"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** How much is logged when nothing says otherwise. */
export const DEFAULT_LOG_LEVEL: LogLevel = "info";

const prettify = prettyFactory({
  colorize: false,
  translateTime: "SYS:HH:MM:ss.l",
  ignore: "pid,hostname,module",
  messageFormat: "{if module}{module}: {end}{msg}",
});

// Where lines go: nowhere until `configureLog` opens a file.
let file: { write(text: string): unknown } | undefined;

/** The root logger. Each line is written synchronously, so none is lost when the process exits. */
export const logger = pino({ level: "silent" }, { write: (line: string) => void file?.write(prettify(line)) });

const children: pino.Logger[] = [];

/** A child of `logger` for the module `module`: each line it writes says which module it came from. */
export function moduleLogger(module: string): pino.Logger {
  const child = logger.child({ module });
  children.push(child);
  return child;
}

/**
 * Logs to the file `path`, an absolute path, creating it and the folders above it, at `level`.
 * Sets the level of every module logger too: a pino child takes its parent's level when it's
 * made, and doesn't follow it after. At `silent`, no file is created.
 */
export function configureLog({ path, level }: { path: string; level: LogLevel }): void {
  if (level !== "silent") file = pino.destination({ dest: path, mkdir: true, sync: true });
  logger.level = level;
  for (const child of children) child.level = level;
}
