// `thunderjar show`, through the CLI, in place in fixtureTests/scenario_8_recorded_executions,
// which starts with a run data store of four executions:
//
//   01k4tq3h…  fails      recorded before aggregation results were stored; one run exited 3
//                         and was never measured
//   01k4x9j2…  fails      readmeExists, since deleted, errored in each permutation's first iteration;
//                         the behaving agent's first iteration took isPrimeTemplateTest with an
//                         older template, so that one measure is stale
//   01k4xb7q…  times-out  a task without measurements
//   01k4xc00…  fails      the latest, after readmeExists was deleted
//
// In `fails`, fake-harness-alpha@1.0.1 exits 3 and 1.0.0 behaves. Each asserts on stdout. Any of
// these can be run by hand:
//
//   bun run fixture 8 show fails

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scenario, thunderjar } from "../../testing/cli.ts";

const OLDEST = "01k4tq3h8r0000000000000000";
const ERRORED = "01k4x9j2e8mqz3abcdefghjkmn";
const TIMES_OUT = "01k4xb7q0c2tnvabcdefghjkmn";
const LATEST = "01k4xc0000000000000000000a";

/** The permutations of `fails`: the failing agent, then the one that behaves. */
const FAILING = "42440c48";
const BEHAVES = "8ffdda6e";

describe("scenario_8_recorded_executions", () => {
  const fixtures = scenario("scenario_8_recorded_executions");
  const show = (target: string) => thunderjar(fixtures, ["show", target]);

  test("show <test case>: its latest execution, each permutation's aggregation result in the order its methods were chosen", async () => {
    expect(await show("fails")).toEqual({
      stdout: `Execution  ${LATEST}  (latest of fails)
Test case  fails
Task       is-prime
Date       2026-09-30 08:00

Permutation ${FAILING}  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.1/fake-model-small | plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTemplateTest  0/2       —
  isPrimeTsExists      2/2       rate 0.00
  tsIgnoreCount        0/2       —

  exit       2/2 exited 3
  duration   mean 0.04s, max 0.04s

Permutation ${BEHAVES}  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTemplateTest  2/2       mean {passed: 3.0, failed: 2.0}, sum {passed: 6, failed: 4}
  isPrimeTsExists      2/2       rate 1.00
  tsIgnoreCount        2/2       median 1.0, min 1, sum 2

  exit       2/2 exited 0
  duration   mean 0.04s, max 0.04s
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("show <execution ID>: that execution, even when it isn't the latest, keeping a measurement deleted since and leaving an errored iteration out of the aggregate", async () => {
    expect(await show(ERRORED)).toEqual({
      stdout: `Execution  ${ERRORED}
Test case  fails
Task       is-prime
Date       2026-09-29 14:30

Permutation ${FAILING}  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.1/fake-model-small | plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTemplateTest  0/2       —
  isPrimeTsExists      2/2       rate 0.00
  readmeExists         1/2       count 1, rate 1.00
  tsIgnoreCount        0/2       —

  exit       2/2 exited 3
  duration   mean 0.04s, max 0.04s

Permutation ${BEHAVES}  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTemplateTest  2/2       mean {passed: 3.0, failed: 2.0}, sum {passed: 6, failed: 4}
  isPrimeTsExists      2/2       rate 1.00
  readmeExists         1/2       count 0, rate 0.00
  tsIgnoreCount        2/2       median 1.0, min 1, sum 2

  exit       2/2 exited 0
  duration   mean 0.04s, max 0.04s
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("show <container run> measured with an older template: (stale) after that measure's value only, beside a current and a deleted measurement", async () => {
    const tag = `postrun-e${ERRORED}-h${BEHAVES}-i00`;
    expect(await show(tag)).toEqual({
      stdout: `Container run  ${tag}
Execution      ${ERRORED}  (fails)
Permutation    ${BEHAVES}, iteration 1
Ran at         2026-09-29 14:30

Parameters
  baseImage      node20                                     26d9
  codeState      baseline                                   bb15
  promptSet      snerk                                      827a
  harnessModel   fake-harness-alpha@1.0.0/fake-model-small  da28
  initialPrompt  plain                                      9e30

Measures
  isPrimeTemplateTest  {passed: 3, failed: 2} (stale)
  isPrimeTsExists      true
  readmeExists         error  (disk on fire)
  tsIgnoreCount        1

Duration  0.04s   exit code 0
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("show <container run>: its parameters, measures, duration and exit code", async () => {
    const tag = `postrun-e${ERRORED}-h${BEHAVES}-i01`;
    expect(await show(tag)).toEqual({
      stdout: `Container run  ${tag}
Execution      ${ERRORED}  (fails)
Permutation    ${BEHAVES}, iteration 2
Ran at         2026-09-29 14:30

Parameters
  baseImage      node20                                     26d9
  codeState      baseline                                   bb15
  promptSet      snerk                                      827a
  harnessModel   fake-harness-alpha@1.0.0/fake-model-small  da28
  initialPrompt  plain                                      9e30

Measures
  isPrimeTemplateTest  {passed: 3, failed: 2}
  isPrimeTsExists      true
  readmeExists         false
  tsIgnoreCount        1

Duration  0.04s   exit code 0
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("show <container run> that failed: why each measure was skipped, and an instrument's error", async () => {
    const tag = `postrun-e${ERRORED}-h${FAILING}-i00`;
    expect(await show(tag)).toEqual({
      stdout: `Container run  ${tag}
Execution      ${ERRORED}  (fails)
Permutation    ${FAILING}, iteration 1
Ran at         2026-09-29 14:30

Parameters
  baseImage      node20                                     26d9
  codeState      baseline                                   bb15
  promptSet      snerk                                      827a
  harnessModel   fake-harness-alpha@1.0.1/fake-model-small  c0b2
  initialPrompt  plain                                      9e30

Measures
  isPrimeTemplateTest  skipped  (no file matches **/isPrime.ts)
  isPrimeTsExists      false
  readmeExists         error  (disk on fire)
  tsIgnoreCount        skipped  (no file matches **/*.ts)

Duration  0.04s   exit code 3
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("an execution recorded without aggregation results says so, and runs with different exit codes are counted by code", async () => {
    expect(await show(OLDEST)).toEqual({
      stdout: `Execution  ${OLDEST}
Test case  fails
Task       is-prime
Date       2026-09-28 09:15

Permutation ${FAILING}  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.1/fake-model-small | plain

  no aggregation result recorded

  exit       2/2 exited 3

Permutation ${BEHAVES}  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain

  no aggregation result recorded

  exit       1/2 exited 0, 1/2 exited 3
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("show <container run> leaves the checked-in store byte for byte as it was", async () => {
    const store = join(fixtures, ".thunderjar", ".data", "runs.json");
    const before = readFileSync(store);
    for (const iteration of ["i00", "i01"]) expect((await show(`postrun-e${ERRORED}-h${BEHAVES}-${iteration}`)).exitCode).toBe(0);
    expect(readFileSync(store).equals(before)).toBe(true);
  });

  test("a container run with no measures shows none", async () => {
    const { stdout } = await show(`postrun-e${OLDEST}-h${BEHAVES}-i01`);
    expect(stdout.split("\n").slice(11)).toEqual(["", "Measures", "  none", "", "Duration  0.04s   exit code 3", ""]);
  });

  test("a task without measurements shows none, with its exit codes and durations", async () => {
    expect(await show("times-out")).toEqual({
      stdout: `Execution  ${TIMES_OUT}  (latest of times-out)
Test case  times-out
Task       wait
Date       2026-09-29 15:02

Permutation 389190d4  (2 iterations)
  node20 | baseline | snerk | fake-harness-alpha@1.0.2/fake-model-small | impatient

  no measures

  exit       2/2 exited 124
  duration   mean 0.04s, max 0.04s
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("an unknown argument is an error that names it, with a non-zero exit", async () => {
    for (const target of ["nope", `postrun-e${LATEST}-h00000000-i00`]) {
      expect(await show(target)).toEqual({
        stdout: "",
        stderr: `${target} is not a recorded container run, execution or test case\n`,
        exitCode: 1,
      });
    }
  });

  test("prints usage for no argument, extra arguments or a flag", async () => {
    for (const args of [["show"], ["show", "a", "b"], ["show", "--json"], ["show", "fails", "--data-dir"]]) {
      const { stderr, exitCode } = await thunderjar(fixtures, args);
      expect(stderr).toBe("usage: thunderjar show <test case | execution | container run> [--data-dir <dir>]\n");
      expect(exitCode).toBe(1);
    }
  });
});

describe("scenario_5_empty_parameter_folders", () => {
  test("show --data-dir reads a store kept elsewhere", async () => {
    const recorded = scenario("scenario_8_recorded_executions");
    const dataDir = join(recorded, ".thunderjar", ".data");
    const elsewhere = await thunderjar(scenario("scenario_5_empty_parameter_folders"), ["show", TIMES_OUT, "--data-dir", dataDir]);
    expect(elsewhere.exitCode).toBe(0);
    expect(elsewhere).toEqual(await thunderjar(recorded, ["show", TIMES_OUT]));
  });
});
