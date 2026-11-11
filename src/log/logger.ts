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
// A pino logger, writing JSON lines to stderr, so stdout stays the command's output. Silent unless
// a level is asked for, with `--log-level <level>` or THUNDERJAR_LOG_LEVEL, e.g.
//
//   THUNDERJAR_LOG_LEVEL=debug thunderjar run example 2> >(bunx pino-pretty)
import pino from "pino";

export const LOG_LEVELS = ["silent", "fatal", "error", "warn", "info", "debug", "trace"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const isLogLevel = (level: string): level is LogLevel => (LOG_LEVELS as readonly string[]).includes(level);

const envLevel = Bun.env.THUNDERJAR_LOG_LEVEL;

/** The root logger. Writes synchronously, so no line is lost when the process exits. */
export const logger = pino(
  { name: "thunderjar", level: envLevel !== undefined && isLogLevel(envLevel) ? envLevel : "silent" },
  pino.destination({ fd: 2, sync: true }),
);

const children: pino.Logger[] = [];

/** A child of `logger` for the module `module`: each line it writes says which module it came from. */
export function moduleLogger(module: string): pino.Logger {
  const child = logger.child({ module });
  children.push(child);
  return child;
}

/**
 * Sets the level of `logger` and of every module logger. A pino child takes its parent's level
 * when it's made, and doesn't follow it after, so each is set here too.
 */
export function setLogLevel(level: LogLevel): void {
  logger.level = level;
  for (const child of children) child.level = level;
}
