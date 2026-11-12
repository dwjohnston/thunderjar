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

import { Option } from "commander";

/**
 * `--json`: print the command's results on stdout as JSON. Its progress and human-readable text go
 * to stderr instead (see textOutput.ts), so stdout can be piped to a script. Errors still go to
 * stderr, with a non-zero exit code.
 */
export function jsonOption(): Option {
  return new Option("--json", "print the results on stdout as JSON, for scripts. Progress goes to stderr");
}
