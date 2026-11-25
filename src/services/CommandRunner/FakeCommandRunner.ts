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

import type { CommandResult, CommandRunner } from "./CommandRunner";

type Failure = { prefix: string[] | string; result: CommandResult };

const startsWith = (command: string[], prefix: string[] | string) =>
  typeof prefix === "string" ? command.join(" ").startsWith(prefix) : prefix.every((part, i) => command[i] === part);

/**
 * A CommandRunner that runs nothing: it records each call, and every command exits 0 unless
 * `fail` says otherwise, e.g. `commands.fail(["make", "tea"], { exitCode: 2, stderr: "no milk" })`.
 */
export class FakeCommandRunner implements CommandRunner {
  /** Every call, oldest first. */
  readonly calls: { command: string[]; env: Record<string, string> }[] = [];
  private readonly failures: Failure[] = [];

  /**
   * Commands starting with `commandPrefix` fail from now on: exit code 1 and no stderr, unless
   * given. The prefix is the first arguments, or one string the command line starts with. If
   * several match a command, the latest wins.
   */
  fail(commandPrefix: string[] | string, result: Partial<CommandResult> = {}): void {
    this.failures.push({ prefix: commandPrefix, result: { exitCode: 1, stderr: "", ...result } });
  }

  async run(command: string[], env: Record<string, string>): Promise<CommandResult> {
    this.calls.push({ command: [...command], env: { ...env } });
    const failure = this.failures.findLast(({ prefix }) => startsWith(command, prefix));
    return failure ? { ...failure.result } : { exitCode: 0, stderr: "" };
  }
}
