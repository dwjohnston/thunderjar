/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import type { Env } from "../Env/Env";

export type CommandResult = { exitCode: number; /** Everything it wrote to stderr. */ stderr: string };

/** Runs a command on this machine and waits for it, so a test can pass a FakeCommandRunner in its place. */
export interface CommandRunner {
  /**
   * Runs `command` (the program, then its arguments) with the service's own environment plus
   * `env`, whose values win. It is given no stdin and its stdout is dropped. Never rejects: a
   * command that can't be started resolves to exit code 127, the shell's "command not found",
   * with the reason as its stderr.
   */
  run(command: string[], env: Record<string, string>): Promise<CommandResult>;
}

/** Runs real commands, with `env`'s variables. Built only at an entry point. */
export function createCommandRunnerService(env: Env): CommandRunner {
  return {
    async run(command, extra) {
      if (command.length === 0) return { exitCode: 127, stderr: "no command given" };
      try {
        const child = Bun.spawn(command, { env: { ...env.variables, ...extra }, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
        const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
        return { exitCode, stderr };
      } catch (caught) {
        return { exitCode: 127, stderr: caught instanceof Error ? caught.message : String(caught) };
      }
    },
  };
}
