// spec/100-cli-reference.md#conventions: a configuration error is reported as a clear
// message naming the file, the field and the offending value, with a non-zero exit code.
//
// Through the CLI, in the checked-in fixtureTests/ scenarios, in place, except a real `run`, which
// works on a copy. Each asserts on stderr and the exit code. Any of these can be run by hand:
//
//   bun run fixture 9 plan unknown-prompt-set

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { copyOfFixtures, scenario, thunderjar } from "../testing/cli.ts";

// Only the declarations a test case names are loaded, so each broken one here stops only the test
// cases naming it. A task's measurements all load with it, so each broken measurement is in a task
// of its own.
describe("scenario_9_broken_declarations", () => {
  const fixtures = scenario("scenario_9_broken_declarations");
  const plan = (testCase: string) => thunderjar(fixtures, ["plan", testCase]);
  const file = (name: string) => `.thunderjar/test-cases/${name}.ts`;

  test("a test case naming only sound declarations plans cleanly beside the broken ones", async () => {
    const { stderr, exitCode } = await plan("sound");
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("a name with no matching folder", async () => {
    const { stderr, exitCode } = await plan("unknown-prompt-set");
    expect(stderr).toBe(
      `error: ${file("unknown-prompt-set")}: promptSet: "snirk" has no matching test-case-parameters/promptSets/snirk/index.ts\n`,
    );
    expect(exitCode).toBe(1);
  });

  test("a task with no folder", async () => {
    const { stderr, exitCode } = await plan("unknown-task");
    expect(stderr).toBe(
      `error: ${file("unknown-task")}: task: "is-even" has no matching test-case-parameters/tasks/is-even/\n`,
    );
    expect(exitCode).toBe(1);
  });

  test("an initial prompt that belongs to a different task", async () => {
    const { stderr, exitCode } = await plan("prompt-of-another-task");
    expect(stderr).toBe(
      `error: ${file("prompt-of-another-task")}: initialPrompt: "fizzy" belongs to task "fizz-buzz", not "is-prime"\n`,
    );
    expect(exitCode).toBe(1);
  });

  test("a declaration file with no default export", async () => {
    const { stderr, exitCode } = await plan("unexported-base-image");
    expect(stderr).toBe(
      "error: .thunderjar/test-case-parameters/baseImages/no-default-export/index.ts: has no default export. Export `declareBaseImage(...)` as the default.\n",
    );
    expect(exitCode).toBe(1);
  });

  test("a declaration not wrapped in its declareX", async () => {
    const { stderr, exitCode } = await plan("unwrapped-code-state");
    expect(stderr).toBe(
      "error: .thunderjar/test-case-parameters/codeStates/unwrapped/index.ts: default export is not wrapped in declareCodeState(...).\n",
    );
    expect(exitCode).toBe(1);
  });

  test("a declaration wrapped in the wrong declareX", async () => {
    const { stderr, exitCode } = await plan("wrongly-wrapped-code-state");
    expect(stderr).toBe(
      "error: .thunderjar/test-case-parameters/codeStates/wrongly-wrapped/index.ts: default export is wrapped in declareBaseImage, expected declareCodeState.\n",
    );
    expect(exitCode).toBe(1);
  });

  test("a harness/model pair naming a version or model absent from its family", async () => {
    const { stderr, exitCode } = await plan("unknown-harness-models");
    const tc = file("unknown-harness-models");
    expect(stderr).toBe(
      [
        `error: ${tc}: harnessModel: "fake-harness-alpha@9.9.9/fake-model-small": version "9.9.9" is not in test-case-parameters/harnessModels/fake-harness-alpha/versions.ts`,
        `error: ${tc}: harnessModel: "fake-harness-alpha@1.0.0/fake-model-huge": model "fake-model-huge" is not in test-case-parameters/harnessModels/fake-harness-alpha/models.ts`,
        `error: ${tc}: harnessModel: "fake-harness-alpha-1.0.0" is not of the form family@version/model`,
        "",
      ].join("\n"),
    );
    expect(exitCode).toBe(1);
  });

  test("an empty array, and iterations that is not a positive integer", async () => {
    const { stderr, exitCode } = await plan("empty-code-states");
    expect(stderr).toBe(
      [
        `error: ${file("empty-code-states")}: codeState: must name at least one value, got []`,
        `error: ${file("empty-code-states")}: iterations: must be a positive integer, got 2.5`,
        "",
      ].join("\n"),
    );
    expect(exitCode).toBe(1);

    const zero = await plan("zero-iterations");
    expect(zero.stderr).toBe(`error: ${file("zero-iterations")}: iterations: must be a positive integer, got 0\n`);
    expect(zero.exitCode).toBe(1);
  });

  const measurement = (task: string, name = "isPrimeTsExists") =>
    `.thunderjar/test-case-parameters/tasks/${task}/measurements/${name}.ts`;

  /** `plan`, then a real `run` in a copy, which stops before running anything, so records nothing. */
  async function planAndRun(testCase: string) {
    const results = [await plan(testCase)];
    const copy = await copyOfFixtures(fixtures);
    results.push(await thunderjar(copy, ["run", testCase]));
    expect(existsSync(join(copy, ".thunderjar", ".data"))).toBe(false);
    return results;
  }

  test("a measurement naming an unknown instrument", async () => {
    for (const { stderr, exitCode } of await planAndRun("unknown-instrument")) {
      expect(stderr).toBe(
        `error: ${measurement("unknown-instrument")}: instrument: "fileCraeted" is not a known instrument. Known instruments: fileCreated, grep, templateTest\n`,
      );
      expect(exitCode).toBe(1);
    }
  });

  test("a measurement whose config doesn't fit its instrument, or with no aggregate", async () => {
    const { stderr, exitCode } = await plan("misfit-config");
    expect(stderr).toBe(
      [
        `error: ${measurement("misfit-config")}: config.glob: must be a glob pattern, got undefined`,
        `error: ${measurement("misfit-config")}: aggregate: must be an array of aggregation methods, got undefined`,
        "",
      ].join("\n"),
    );
    expect(exitCode).toBe(1);
  });

  test("a measurement not wrapped in declareMeasurement", async () => {
    const { stderr, exitCode } = await plan("unwrapped-measurement");
    expect(stderr).toBe(
      `error: ${measurement("unwrapped-measurement")}: default export is not wrapped in declareMeasurement(...).\n`,
    );
    expect(exitCode).toBe(1);
  });

  test("a templateTest measurement whose template is missing", async () => {
    for (const { stderr, exitCode } of await planAndRun("missing-template")) {
      expect(stderr).toBe(
        `error: ${measurement("missing-template", "isPrimeTemplateTest")}: config.template: "./isPrime.tset.template.ts" has no matching test-case-parameters/tasks/missing-template/measurements/isPrime.tset.template.ts\n`,
      );
      expect(exitCode).toBe(1);
    }
  });

  test("a measurement whose aggregate names a method its instrument's values don't combine by", async () => {
    for (const { stderr, exitCode } of await planAndRun("unfit-aggregate")) {
      expect(stderr).toBe(
        [
          `error: ${measurement("unfit-aggregate")}: aggregate: "mean" is not a way fileCreated's values combine. Use one of: rate, count`,
          `error: ${measurement("unfit-aggregate")}: aggregate: "avg" is not a way fileCreated's values combine. Use one of: rate, count`,
          "",
        ].join("\n"),
      );
      expect(exitCode).toBe(1);
    }
  });

  test("a grep measurement whose pattern isn't a valid regex", async () => {
    const { stderr, exitCode } = await plan("invalid-pattern");
    expect(stderr).toStartWith(
      `error: ${measurement("invalid-pattern", "tsIgnoreCount")}: config.pattern: "@ts-ignore(" is not a valid regular expression: `,
    );
    expect(exitCode).toBe(1);
  });
});

// generate loads every harness family's version and model maps, so one broken map stops it for the
// whole project, not only the test cases naming that family.
describe("scenario_10_broken_harness_family", () => {
  const fixtures = scenario("scenario_10_broken_harness_family");
  const VERSIONS_ERROR =
    "error: .thunderjar/test-case-parameters/harnessModels/fake-harness-beta/versions.ts: default export is not wrapped in declareHarnessVersions(...).\n";

  test("generate reports an unwrapped family map", async () => {
    const { stderr, exitCode } = await thunderjar(fixtures, ["generate"]);
    expect(stderr).toBe(VERSIONS_ERROR);
    expect(exitCode).toBe(1);
  });

  test("plan reports it for a test case naming that family, and not for one that doesn't", async () => {
    const beta = await thunderjar(fixtures, ["plan", "beta"]);
    expect(beta.stderr).toBe(VERSIONS_ERROR);
    expect(beta.exitCode).toBe(1);

    const example = await thunderjar(fixtures, ["plan", "example"]);
    expect(example.stderr).toBe("");
    expect(example.exitCode).toBe(0);
  });
});
