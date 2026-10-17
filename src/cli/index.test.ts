// With no command, or one it doesn't know, `thunderjar` prints its usage and exits non-zero:
//
//   bun run fixture 1
//   bun run fixture 1 frobnicate

import { describe, expect, test } from "bun:test";
import { scenario, thunderjar } from "../testing/cli.ts";

const usage = `usage: thunderjar <command> [<args>]

commands:
  init                                  create .thunderjar/ in this project
  generate                              write the parameter-name types for this project
  plan <test case>                      print what a run of a test case would do
  build <test case>                     build a test case's prerun images
  run <test case>                       run a test case
  executions [<test case>]              list recorded executions
  show <test case | execution | run>    show a test case, an execution or a container run
  remeasure <test case | execution>     apply the current measurements to past runs
`;

describe("scenario_1_minimal_initial_setup", () => {
  const fixtures = scenario("scenario_1_minimal_initial_setup");

  test("no command prints the usage", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, []);
    expect(stdout).toBe("");
    expect(stderr).toBe(usage);
    expect(exitCode).toBe(1);
  });

  test("an unknown command is named, then the usage", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["frobnicate"]);
    expect(stdout).toBe("");
    expect(stderr).toBe(`unknown command: frobnicate\n${usage}`);
    expect(exitCode).toBe(1);
  });
});
