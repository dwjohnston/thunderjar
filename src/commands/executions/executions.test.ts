// `thunderjar executions`, through the CLI, in the checked-in fixtureTests/ scenarios, in place.
// Scenario 8 starts with a run data store of four executions of two test cases; scenario 5 has
// none. Each asserts on stdout. Any of these can be run by hand:
//
//   bun run fixture 8 executions fails

import { describe, expect, test } from "bun:test";
import { scenario, thunderjar } from "../../testing/cli.ts";

describe("scenario_5_empty_parameter_folders", () => {
  const fixtures = scenario("scenario_5_empty_parameter_folders");

  test("lists nothing before anything has run", async () => {
    expect(await thunderjar(fixtures, ["executions"])).toEqual({
      stdout: "No executions recorded.\n",
      stderr: "",
      exitCode: 0,
    });
    expect(await thunderjar(fixtures, ["executions", "fails"])).toEqual({
      stdout: "No executions recorded for fails.\n",
      stderr: "",
      exitCode: 0,
    });
  });
});

describe("scenario_8_recorded_executions", () => {
  const fixtures = scenario("scenario_8_recorded_executions");

  test("executions: every test case's executions, newest first", async () => {
    expect(await thunderjar(fixtures, ["executions"])).toEqual({
      stdout: `01k4xc0000000000000000000a  fails      2026-09-30 08:00
01k4xb7q0c2tnvabcdefghjkmn  times-out  2026-09-29 15:02
01k4x9j2e8mqz3abcdefghjkmn  fails      2026-09-29 14:30
01k4tq3h8r0000000000000000  fails      2026-09-28 09:15
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("executions <test case>: only that test case's, newest first", async () => {
    expect(await thunderjar(fixtures, ["executions", "fails"])).toEqual({
      stdout: `01k4xc0000000000000000000a  fails  2026-09-30 08:00
01k4x9j2e8mqz3abcdefghjkmn  fails  2026-09-29 14:30
01k4tq3h8r0000000000000000  fails  2026-09-28 09:15
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("executions <test case> with nothing recorded says so", async () => {
    expect(await thunderjar(fixtures, ["executions", "nope"])).toEqual({
      stdout: "No executions recorded for nope.\n",
      stderr: "",
      exitCode: 0,
    });
  });

  test("prints usage for extra arguments or a flag", async () => {
    for (const args of [["executions", "a", "b"], ["executions", "--json"]]) {
      const { stderr, exitCode } = await thunderjar(fixtures, args);
      expect(stderr).toBe("usage: thunderjar executions [<test case>]\n");
      expect(exitCode).toBe(1);
    }
  });
});
