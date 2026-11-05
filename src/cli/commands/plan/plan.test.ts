// `thunderjar plan`, through the CLI. It only reads the project, so it runs on the scenarios
// unchanged. Any of these can be run by hand, e.g. `bun run fixture 0402 plan unknown-prompt-set`.
import { describe, expect, test } from "bun:test";
import { thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

/** What 0202's fake-harness-alpha needs: `plan` and `run` stop without it. */
const KEY = { FAKE_HARNESS_KEY: "fake-key" };

const EXAMPLE_PLAN = `baseImage:     node20
codeState:     baseline
promptSet:     snerk
harnessModel:  fake-harness-alpha@1.0.0/fake-model-small
task:          is-prime
initialPrompt: plain

Matrix shape: 1/1/1/1/1 (1 permutation)

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   b7b0c69c  missing
`;

describe("0201 minimal existing setup", () => {
  test("summarises the parameters the test case names, and its one permutation", async () => {
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

// The hashes are exact: they only change when the scenario's declarations, or the hashing, change.
describe("0202 typical project", () => {
  test("lists every permutation of the matrix, with its hash", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`baseImage:     node20
codeState:     baseline
promptSet:     snerk, glurk
harnessModel:  fake-harness-alpha@1.0.0/fake-model-small, fake-harness-beta@1.0.0/fake-model-large
task:          is-prime
initialPrompt: plain, terse

Matrix shape: 1/1/2/2/2 (8 permutations)

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   6274bd13  missing
 2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse   fe8d47cc  missing
 3  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | plain   9ca648c2  missing
 4  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse   81e5b063  missing
 5  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | plain   6bcdf9f3  missing
 6  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | terse   15846748  missing
 7  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | plain   d1e2fa39  missing
 8  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | terse   65f3bfb0  missing
`);
  });

  // Each pair of permutations differing only in their initial prompt, which has no fragment, shares a prerun image.
  test("says which prerun images are built, asking Docker once", async () => {
    await using docker = await fakeDocker({
      images: ["thunderjar-prerun:b9cd78e6", "thunderjar-prerun:44230271", "other-prerun:e01991db", "thunderjar-postrun:65f3bfb0"],
    });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(` 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   6274bd13  built
 2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse   fe8d47cc  built
 3  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | plain   9ca648c2  built
 4  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse   81e5b063  built
 5  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | plain   6bcdf9f3  missing
 6  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | terse   15846748  missing
 7  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | plain   d1e2fa39  missing
 8  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | terse   65f3bfb0  missing
`);
    expect(await docker.commands()).toEqual(["docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun"]);
  });

  test("--image-prefix looks for the images under that prefix", async () => {
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:b9cd78e6", "other-prerun:e01991db"] });

    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline", "--image-prefix", "other"], {
      env: { ...docker.env, ...KEY },
    });

    expect(exitCode).toBe(0);
    expect(stdout.match(/(?<=[0-9a-f]{8}  )\w+$/gm)).toEqual(["missing", "missing", "missing", "missing", "missing", "missing", "built", "built"]);
    expect(await docker.commands()).toEqual(["docker image ls --format {{.Repository}}:{{.Tag}} other-prerun"]);
  });

  test("an --image-prefix Docker wouldn't accept is an error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "example", "--image-prefix", "Other"], { env: KEY });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "error: option '--image-prefix <name>' argument 'Other' is invalid. It must be lowercase letters and digits, joined by single separators (., _, __ or -), as a Docker repository name is.\n",
    );
    expect(exitCode).toBe(1);
  });

  test("when Docker can't be reached, it still plans, with each image's status unknown, and says why", async () => {
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:b9cd78e6"], unreachable: true });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "example"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe(
      "Warning: Docker can't be reached, so whether each prerun image is built is unknown: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
    );
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(" 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   6274bd13  unknown\n");
  });

  test("without a docker command, it still plans, with each image's status unknown", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "example"], {
      env: { THUNDERJAR_DOCKER: "no-such-docker", ...KEY },
    });

    expect(stderr).toBe(
      "Warning: Docker can't be reached, so whether each prerun image is built is unknown: bun: command not found: no-such-docker\n",
    );
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith("plain   6274bd13  unknown\n");
  });

  test("a permutation has the same hash in every test case naming it", async () => {
    const { stdout } = await thunderjar(scenario("0202"), ["plan", "example"], { env: KEY });

    expect(stdout).toEndWith(
      " 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   6274bd13  missing\n",
    );
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

describe("0202 typical project, without the key fake-harness-alpha needs", () => {
  test("names the variable and the harness that needs it, and plans nothing", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline"], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: fake-harness-alpha needs FAKE_HARNESS_KEY, which is not set.\nExport it in the shell that runs thunderjar.\n");
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });

  test("an empty value is as good as unset", async () => {
    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "example"], { env: { FAKE_HARNESS_KEY: "" } });

    expect(stderr).toStartWith("Error: fake-harness-alpha needs FAKE_HARNESS_KEY, which is not set.");
    expect(exitCode).toBe(1);
  });
});

// Only the declarations a test case names are loaded, so each broken one stops only the test cases
// naming it.
describe("0402 broken declarations", () => {
  const plan = (testCase: string) => thunderjar(scenario("0402"), ["plan", testCase]);
  const testCase = (name: string) => `.thunderjar/test-cases/${name}.ts`;
  const parameter = (path: string) => `.thunderjar/test-case-parameters/${path}`;
  const measurement = (path: string) => parameter(`tasks/${path}`);

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
    [
      "a measurement naming an unknown instrument",
      "unknown-instrument",
      [
        `${measurement("unknown-instrument/measurements/isPrimeTsExists.ts")}: instrument: "fileCraeted" is not a known instrument. Known instruments: fileCreated, grep, templateTest, replyMatches, shell`,
      ],
    ],
    [
      "a measurement whose config doesn't fit its instrument",
      "misfit-config",
      [`${measurement("misfit-config/measurements/isPrimeTsExists.ts")}: config.glob: must be a glob pattern, got undefined`],
    ],
    [
      "a measurement combining its values in a way its instrument's can't be",
      "unfit-aggregate",
      [
        `${measurement("unfit-aggregate/measurements/isPrimeTsExists.ts")}: aggregate: "mean" is not a way fileCreated's values combine. Use one of: rate, count`,
      ],
    ],
    [
      "a templateTest measurement whose template is missing",
      "missing-template",
      [
        `${measurement("missing-template/measurements/isPrimeTemplateTest.ts")}: config.template: "./isPrime.tset.template.ts" has no matching ${measurement("missing-template/measurements/isPrime.tset.template.ts")}`,
      ],
    ],
    [
      "a grep measurement whose pattern isn't a valid regular expression",
      "invalid-regex",
      [`${measurement("invalid-regex/measurements/tsIgnoreCount.ts")}: config.pattern: "@ts-ignore(" is not a valid regular expression: missing )`],
    ],
    [
      "a base image whose run options take over what Thunderjar does",
      "reserved-run-options",
      [`${parameter("baseImages/reserved-options/index.ts")}: runOptions: "--rm", "--entrypoint=bash" can't be given: Thunderjar sets them itself`],
    ],
    [
      "an initial prompt with both a prompt and turns",
      "muddled-prompt",
      [`${parameter("tasks/is-prime/initial-prompts/muddled.ts")}: turns: can't be given beside prompt. Give a single prompt, or a list of turns.`],
    ],
    [
      "an initial prompt with no time to run in",
      "zero-timeout",
      [`${parameter("tasks/is-prime/initial-prompts/untimed.ts")}: timeoutSeconds: must be a number of seconds above 0, got 0`],
    ],
    [
      "a harness whose requiredEnv isn't a list of variable names",
      "bad-required-env",
      [`${parameter("harnessModels/fake-harness-bad-env/index.ts")}: requiredEnv: "API KEY", 3 are not environment variable names`],
    ],
    [
      "a measurement not wrapped in declareMeasurement",
      "unwrapped-measurement",
      [`${measurement("unwrapped-measurement/measurements/isPrimeTsExists.ts")}: default export is not wrapped in declareMeasurement(...).`],
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
