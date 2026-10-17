// `thunderjar remeasure`, through the CLI, in place in fixtureTests/scenario_8_recorded_executions,
// which starts with a run data store of four executions. For now the command is only its entry
// point: a valid invocation prints a placeholder, without reading or writing the store or using
// Docker. Each asserts on stdout, stderr and the exit code. Any of these can be run by hand:
//
//   bun run fixture 8 remeasure 01k4x9j2e8mqz3abcdefghjkmn

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDocker, scenario, thunderjar } from "../../testing/cli.ts";

const USAGE = "usage: thunderjar remeasure <test case | execution> [--data-dir <dir>]\n";

describe("scenario_8_recorded_executions", () => {
  const fixtures = scenario("scenario_8_recorded_executions");
  const dataDir = join(fixtures, ".thunderjar", ".data");
  const store = join(dataDir, "runs.json");

  test("remeasure <execution | test case> prints that it isn't implemented, and touches nothing", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    for (const args of [
      ["remeasure", "01k4x9j2e8mqz3abcdefghjkmn"],
      ["remeasure", "fails"],
      ["remeasure", "01k4x9j2e8mqz3abcdefghjkmn", "--data-dir", dataDir],
      ["remeasure", "--data-dir", dataDir, "01k4x9j2e8mqz3abcdefghjkmn"],
    ]) {
      expect(await thunderjar(fixtures, args, docker.env)).toEqual({
        stdout: "Not implemented: remeasure.\n",
        stderr: "",
        exitCode: 0,
      });
    }
    expect(readFileSync(store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });

  test("prints usage for a missing target, extra arguments, an unknown flag, or a bad --data-dir", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    for (const args of [
      ["remeasure"],
      ["remeasure", "01k4x9j2e8mqz3abcdefghjkmn", "fails"],
      ["remeasure", "01k4x9j2e8mqz3abcdefghjkmn", "--force"],
      ["remeasure", "--json", "01k4x9j2e8mqz3abcdefghjkmn"],
      ["remeasure", "01k4x9j2e8mqz3abcdefghjkmn", "--data-dir"],
      ["remeasure", "--data-dir", "01k4x9j2e8mqz3abcdefghjkmn"],
      ["remeasure", "01k4x9j2e8mqz3abcdefghjkmn", "--data-dir", dataDir, "--data-dir", dataDir],
    ]) {
      expect({ args, ...(await thunderjar(fixtures, args, docker.env)) }).toEqual({
        args,
        stdout: "",
        stderr: USAGE,
        exitCode: 1,
      });
    }
    expect(readFileSync(store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });
});
