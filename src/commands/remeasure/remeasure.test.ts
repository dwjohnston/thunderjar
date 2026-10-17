// `thunderjar remeasure`, through the CLI, in place in fixtureTests/scenario_8_recorded_executions,
// which starts with a run data store of four executions. For now an execution prints only its
// plan: each current measurement's status, and each deleted name with its stored measures. A test
// case lists every execution of it, and which have nothing to do. It measures nothing and recomputes nothing, so the store is left as it was and Docker is never
// used. Each asserts on stdout, stderr and the exit code. Any of these can be run by hand:
//
//   bun run fixture 8 remeasure 01k4x9j2e8mqz3abcdefghjkmn
//   bun run fixture 8 remeasure fails

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeDocker, scenario, thunderjar } from "../../testing/cli.ts";

const USAGE = "usage: thunderjar remeasure <test case | execution> [--data-dir <dir>]\n";

/** Recorded before aggregation results were stored; one run exited 3 and was never measured. */
const OLDEST = "01k4tq3h8r0000000000000000";
/** readmeExists, since deleted, errored in each permutation's first iteration; one isPrimeTemplateTest is stale. */
const ERRORED = "01k4x9j2e8mqz3abcdefghjkmn";
/** The latest execution of `fails`, after readmeExists was deleted. */
const LATEST = "01k4xc0000000000000000000a";
/** The only execution of `times-out`, whose task has no measurements; each run exited 124. */
const TIMED_OUT = "01k4xb7q0c2tnvabcdefghjkmn";

const NOT_APPLIED = "Not implemented: applying measurements and recomputing aggregation results.";

describe("scenario_8_recorded_executions", () => {
  const fixtures = scenario("scenario_8_recorded_executions");
  const dataDir = join(fixtures, ".thunderjar", ".data");
  const store = join(dataDir, "runs.json");

  test("remeasure <execution> reports each measurement's status and the deleted readmeExists, and touches nothing", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    const expected = {
      stdout: `Execution ${ERRORED}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  new / changed (e4cf4e5c)
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date
  readmeExists         deleted from task; 4 stored measures kept, excluded from aggregates

${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    };
    for (const args of [
      ["remeasure", ERRORED],
      ["remeasure", ERRORED, "--data-dir", dataDir],
      ["remeasure", "--data-dir", dataDir, ERRORED],
    ]) {
      expect({ args, ...(await thunderjar(fixtures, args, docker.env)) }).toEqual({ args, ...expected });
    }
    expect(readFileSync(store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure <execution> with every measure current reports each up to date, with no deleted names", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    expect(await thunderjar(fixtures, ["remeasure", LATEST], docker.env)).toEqual({
      stdout: `Execution ${LATEST}  (4 container runs)
Current measurements for task is-prime:
  isPrimeTemplateTest  up to date
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date

${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    });
    expect(readFileSync(store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure <test case> reports every execution of it, newest first, and only the latest as already current", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    expect(await thunderjar(fixtures, ["remeasure", "fails"], docker.env)).toEqual({
      stdout: `fails has 3 executions (12 container runs)
  ${LATEST}  4 runs  2026-09-30  (already current, nothing to do)
  ${ERRORED}  4 runs  2026-09-29
  ${OLDEST}  4 runs  2026-09-28

${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    });
    expect(readFileSync(store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure <test case> keeps runs whose agent exited non-zero: times-out's has nothing to measure", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    expect(await thunderjar(fixtures, ["remeasure", "times-out"], docker.env)).toEqual({
      stdout: `times-out has 1 execution (2 container runs)
  ${TIMED_OUT}  2 runs  2026-09-29  (already current, nothing to do)

${NOT_APPLIED}
`,
      stderr: "",
      exitCode: 0,
    });
    expect(readFileSync(store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });

  test("fails for a target that is neither a recorded execution nor a test case, a postrun tag among them", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    for (const target of ["is-even", "postrun-e01k4x9j2e8mqz3abcdefghjkmn-h8ffdda6e-i00"]) {
      expect(await thunderjar(fixtures, ["remeasure", target], docker.env)).toEqual({
        stdout: "",
        stderr: `${target} is not a recorded execution or test case\n`,
        exitCode: 1,
      });
    }
    expect(readFileSync(store).equals(before)).toBe(true);
    expect(docker.commands()).toEqual([]);
  });

  test("remeasure --data-dir reads only the store there: an empty one has no executions", async () => {
    const empty = await mkdtemp(join(tmpdir(), "thunderjar-remeasure-"));
    const docker = await fakeDocker();
    expect(await thunderjar(fixtures, ["remeasure", ERRORED, "--data-dir", empty], docker.env)).toEqual({
      stdout: "",
      stderr: `${ERRORED} is not a recorded execution or test case\n`,
      exitCode: 1,
    });
    expect(docker.commands()).toEqual([]);
  });

  test("prints usage for a missing target, extra arguments, an unknown flag, or a bad --data-dir", async () => {
    const before = readFileSync(store);
    const docker = await fakeDocker();
    for (const args of [
      ["remeasure"],
      ["remeasure", ERRORED, "fails"],
      ["remeasure", ERRORED, "--force"],
      ["remeasure", "--json", ERRORED],
      ["remeasure", ERRORED, "--data-dir"],
      ["remeasure", "--data-dir", ERRORED],
      ["remeasure", ERRORED, "--data-dir", dataDir, "--data-dir", dataDir],
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
