// `thunderjar plan`, through the CLI. It only reads the project, so it runs on the scenarios
// unchanged. Any of these can be run by hand, e.g. `bun run fixture 0402 plan unknown-prompt-set`.
import { describe, expect, test } from "bun:test";
import { thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

const EXAMPLE_PLAN = `baseImage:     node20
codeState:     baseline
promptSet:     snerk
harnessModel:  fake-harness-alpha@1.0.0/fake-model-small
task:          is-prime
initialPrompt: plain
`;

describe("0201 minimal existing setup", () => {
  test("summarises the parameters the test case names", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["plan", "example"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(EXAMPLE_PLAN);
  });

  test("run in a folder below the project, it finds .thunderjar/ above it", async () => {
    const { stdout, exitCode } = await thunderjar(`${scenario("0201")}/.thunderjar/test-cases`, ["plan", "example"]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(EXAMPLE_PLAN);
  });

  test("a test case with no file", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["plan", "missing"]);

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: No test case named "missing": expected .thunderjar/test-cases/missing.ts.\n');
    expect(exitCode).toBe(1);
  });

  test("without a test case name, it says one is needed", async () => {
    const { stderr, exitCode } = await thunderjar(scenario("0201"), ["plan"]);

    expect(stderr).toBe("error: missing required argument 'test case'\n");
    expect(exitCode).toBe(1);
  });
});

describe("0101 empty project", () => {
  test("without a .thunderjar/ folder, it fails and says to run init", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0101"), ["plan", "example"]);

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "Error: No .thunderjar/ folder in <PROJECT> or any folder above it. Run `thunderjar init` first.\n",
    );
    expect(exitCode).toBe(1);
  });
});

// Only the declarations a test case names are loaded, so each broken one stops only the test cases
// naming it.
describe("0402 broken declarations", () => {
  const plan = (testCase: string) => thunderjar(scenario("0402"), ["plan", testCase]);
  const testCase = (name: string) => `.thunderjar/test-cases/${name}.ts`;
  const parameter = (path: string) => `.thunderjar/test-case-parameters/${path}`;

  test("a test case naming only sound declarations plans beside the broken ones", async () => {
    const { stdout, stderr, exitCode } = await plan("sound");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(EXAMPLE_PLAN);
  });

  test.each([
    [
      "a name with no matching folder",
      "unknown-prompt-set",
      [`${testCase("unknown-prompt-set")}: promptSet: "snirk" has no matching ${parameter("promptSets/snirk/index.ts")}`],
    ],
    [
      "a task with no folder",
      "unknown-task",
      [`${testCase("unknown-task")}: task: "is-even" has no matching ${parameter("tasks/is-even/")}`],
    ],
    [
      "an initial prompt of another task",
      "prompt-of-another-task",
      [`${testCase("prompt-of-another-task")}: initialPrompt: "fizzy" belongs to task "fizz-buzz", not "is-prime"`],
    ],
    [
      "a declaration file with no default export",
      "unexported-base-image",
      [
        `${parameter("baseImages/no-default-export/index.ts")}: has no default export. Export \`declareBaseImage(...)\` as the default.`,
      ],
    ],
    [
      "a declaration not wrapped in its declareX",
      "unwrapped-code-state",
      [`${parameter("codeStates/unwrapped/index.ts")}: default export is not wrapped in declareCodeState(...).`],
    ],
    [
      "a declaration wrapped in the wrong declareX",
      "wrongly-wrapped-code-state",
      [
        `${parameter("codeStates/wrongly-wrapped/index.ts")}: default export is wrapped in declareBaseImage, expected declareCodeState.`,
      ],
    ],
    [
      "harness models naming a version or model their harness doesn't declare, or not of the form",
      "unknown-harness-models",
      [
        `${testCase("unknown-harness-models")}: harnessModel: "fake-harness-alpha@9.9.9/fake-model-small": version "9.9.9" is not in ${parameter("harnessModels/fake-harness-alpha/versions.ts")}`,
        `${testCase("unknown-harness-models")}: harnessModel: "fake-harness-alpha@1.0.0/fake-model-huge": model "fake-model-huge" is not in ${parameter("harnessModels/fake-harness-alpha/models.ts")}`,
        `${testCase("unknown-harness-models")}: harnessModel: "fake-harness-alpha-1.0.0" is not of the form harness@version/model`,
      ],
    ],
    [
      "an empty array, and iterations that isn't an integer",
      "empty-code-states",
      [
        `${testCase("empty-code-states")}: codeState: must name at least one value, got []`,
        `${testCase("empty-code-states")}: iterations: must be a positive integer, got 2.5`,
      ],
    ],
    [
      "zero iterations",
      "zero-iterations",
      [`${testCase("zero-iterations")}: iterations: must be a positive integer, got 0`],
    ],
  ])("%s (%s)", async (_, name, problems) => {
    const { stdout, stderr, exitCode } = await plan(name);

    expect(stdout).toBe("");
    expect(stderr).toBe(problems.map((problem) => `Error: ${problem}\n`).join(""));
    expect(exitCode).toBe(1);
  });
});

describe("0403 broken harness family", () => {
  test("a test case naming the broken harness fails, and one that doesn't plans", async () => {
    const beta = await thunderjar(scenario("0403"), ["plan", "beta"]);
    expect(beta.stdout).toBe("");
    expect(beta.stderr).toBe(
      "Error: .thunderjar/test-case-parameters/harnessModels/fake-harness-beta/versions.ts: default export is not wrapped in declareHarnessVersions(...).\n",
    );
    expect(beta.exitCode).toBe(1);

    const example = await thunderjar(scenario("0403"), ["plan", "example"]);
    expect(example.stderr).toBe("");
    expect(example.stdout).toBe(EXAMPLE_PLAN);
    expect(example.exitCode).toBe(0);
  });
});

describe("0404 empty parameter folders", () => {
  test("names each parameter folder that declares nothing", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0404"), ["plan", "example"]);

    expect(stdout).toBe("");
    expect(stderr).toBe(`Error: .thunderjar/test-case-parameters/baseImages/ has no base images
Error: .thunderjar/test-case-parameters/codeStates/ has no code states
Error: .thunderjar/test-case-parameters/promptSets/ has no prompt sets
Error: .thunderjar/test-case-parameters/harnessModels/ has no harnesses
Error: .thunderjar/test-case-parameters/tasks/ has no tasks
`);
    expect(exitCode).toBe(1);
  });
});
