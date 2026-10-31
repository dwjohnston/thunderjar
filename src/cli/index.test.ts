// With no command, `thunderjar` prints its help and exits non-zero; with one it doesn't know, it
// names it, then prints its help:
//
//   bun run fixture 1
//   bun run fixture 1 frobnicate

import { describe, expect, test } from "bun:test";
import { scenario, thunderjar } from "../testing/cli.ts";

const COMMANDS = ["init", "generate", "plan", "build", "run", "executions", "show", "remeasure"];

/** The command names the help lists, in order. */
const listed = (help: string) =>
  help
    .slice(help.indexOf("Commands:"))
    .split("\n")
    .slice(1)
    .map((line) => /^ {2}(\S+)/.exec(line)?.[1])
    .filter((name) => name !== undefined && name !== "help");

describe("scenario_1_minimal_initial_setup", () => {
  const fixtures = scenario("scenario_1_minimal_initial_setup");

  test("no command prints the help", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, []);
    expect(stdout).toBe("");
    expect(stderr).toStartWith("Usage: thunderjar [options] [command]\n");
    expect(listed(stderr)).toEqual(COMMANDS);
    expect(exitCode).toBe(1);
  });

  test("an unknown command is named, then the help", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["frobnicate"]);
    expect(stdout).toBe("");
    expect(stderr).toStartWith("error: unknown command 'frobnicate'\n");
    expect(listed(stderr)).toEqual(COMMANDS);
    expect(exitCode).toBe(1);
  });

  test("an error a command throws is printed on its own, without a stack trace", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "no-such-test-case"]);
    expect(stdout).toBe("");
    expect(stderr).toContain(`no test case named "no-such-test-case"`);
    expect(stderr).not.toContain("    at ");
    expect(exitCode).toBe(1);
  });
});
