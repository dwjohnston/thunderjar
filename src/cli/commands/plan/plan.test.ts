// `thunderjar plan`, through the CLI. It only reads the project, so it runs on the scenarios
// unchanged. Any of these can be run by hand, e.g. `bun run fixture 0402 plan unknown-prompt-set`.
import { describe, expect, test } from "bun:test";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

/** What 0202's fake-harness-alpha needs: `plan` and `run` stop without it. */
const KEY = { FAKE_HARNESS_KEY: "fake-key" };

const EXAMPLE_PLAN = `baseImage:     node20
codeState:     baseline
promptSet:     snerk
harnessModel:  fake-harness-alpha/fake-model-small-001
task:          is-prime
initialPrompt: plain

Matrix shape: 1/1/1/1/1 (1 permutation)

 1  node20 | baseline | snerk | fake-harness-alpha/fake-model-small-001 | plain   0af800ad  missing
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
harnessModel:  fake-harness-alpha/fake-model-small-001, fake-harness-beta/fake-model-large-001
task:          is-prime
initialPrompt: plain, terse

Matrix shape: 1/1/2/2/2 (8 permutations)

 1  node20 | baseline | snerk | fake-harness-alpha/fake-model-small-001 | plain   bef6be59  missing
 2  node20 | baseline | snerk | fake-harness-alpha/fake-model-small-001 | terse   8b3522e9  missing
 3  node20 | baseline | snerk | fake-harness-beta/fake-model-large-001  | plain   6200c233  missing
 4  node20 | baseline | snerk | fake-harness-beta/fake-model-large-001  | terse   3f62a5bf  missing
 5  node20 | baseline | glurk | fake-harness-alpha/fake-model-small-001 | plain   189377e4  missing
 6  node20 | baseline | glurk | fake-harness-alpha/fake-model-small-001 | terse   31afc3d2  missing
 7  node20 | baseline | glurk | fake-harness-beta/fake-model-large-001  | plain   03d6390a  missing
 8  node20 | baseline | glurk | fake-harness-beta/fake-model-large-001  | terse   93bd21bc  missing
`);
  });

  // The initial prompt is baked into the prerun image, so each permutation has its own.
  test("says which prerun images are built, asking Docker once", async () => {
    await using docker = await fakeDocker({
      images: [
        "thunderjar-prerun:32a1d048",
        "thunderjar-prerun:6aeed656",
        "thunderjar-prerun:577ed2bd",
        "thunderjar-prerun:6eec2774",
        "other-prerun:341adb24",
        "thunderjar-postrun:93bd21bc",
      ],
    });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(` 1  node20 | baseline | snerk | fake-harness-alpha/fake-model-small-001 | plain   bef6be59  built
 2  node20 | baseline | snerk | fake-harness-alpha/fake-model-small-001 | terse   8b3522e9  built
 3  node20 | baseline | snerk | fake-harness-beta/fake-model-large-001  | plain   6200c233  built
 4  node20 | baseline | snerk | fake-harness-beta/fake-model-large-001  | terse   3f62a5bf  built
 5  node20 | baseline | glurk | fake-harness-alpha/fake-model-small-001 | plain   189377e4  missing
 6  node20 | baseline | glurk | fake-harness-alpha/fake-model-small-001 | terse   31afc3d2  missing
 7  node20 | baseline | glurk | fake-harness-beta/fake-model-large-001  | plain   03d6390a  missing
 8  node20 | baseline | glurk | fake-harness-beta/fake-model-large-001  | terse   93bd21bc  missing
`);
    expect(await docker.commands()).toEqual(["docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun"]);
  });

  test("--image-prefix looks for the images under that prefix", async () => {
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:32a1d048", "other-prerun:341adb24", "other-prerun:43876a6a"] });

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
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:32a1d048"], unreachable: true });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "example"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe(
      "Warning: Docker can't be reached, so whether each prerun image is built is unknown: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
    );
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(" 1  node20 | baseline | snerk | fake-harness-alpha/fake-model-small-001 | plain   bef6be59  unknown\n");
  });

  test("without a docker command, it still plans, with each image's status unknown", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "example"], {
      env: { THUNDERJAR_DOCKER: "no-such-docker", ...KEY },
    });

    expect(stderr).toBe(
      "Warning: Docker can't be reached, so whether each prerun image is built is unknown: bun: command not found: no-such-docker\n",
    );
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith("plain   bef6be59  unknown\n");
  });

  test("a permutation has the same hash in every test case naming it", async () => {
    const { stdout } = await thunderjar(scenario("0202"), ["plan", "example"], { env: KEY });

    expect(stdout).toEndWith(
      " 1  node20 | baseline | snerk | fake-harness-alpha/fake-model-small-001 | plain   bef6be59  missing\n",
    );
  });
});

describe("0101 empty project", () => {
  test("without a .thunderjar/ folder, it fails and says to run init", async () => {
    // Outside the repo, whose own .thunderjar/ would otherwise be found above it.
    await using copy = await copyScenarioProject("0101", { outsideRepo: true });
    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["plan", "example"]);

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
  const parameter = (path: string) => `.thunderjar/parameters/${path}`;
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
      "harness models naming a harness that isn't declared, in the old form, or with no model ID",
      "unknown-harness-models",
      [
        `${testCase("unknown-harness-models")}: harnessModel: "fake-harness-gamma/fake-model-small-001" has no matching ${parameter("harnessModels/fake-harness-gamma/")}`,
        `${testCase("unknown-harness-models")}: harnessModel: "fake-harness-alpha@1.0.0/fake-model-small" is in the old form, <harness>@<version>/<model>. Name a harness folder, which pins its version, then the model ID its agent takes, e.g. "fake-harness-alpha/<model ID>"`,
        `${testCase("unknown-harness-models")}: harnessModel: "fake-harness-alpha" is not of the form <harness>/<model ID>`,
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
        `${measurement("unknown-instrument/measurements/isPrimeTsExists.ts")}: instrument: "fileCraeted" is not a known instrument. Known instruments: fileCreated, grep, bunTestFile, replyMatches, shell`,
      ],
    ],
    [
      "a measurement whose config doesn't fit its instrument",
      "misfit-config",
      [`${measurement("misfit-config/measurements/isPrimeTsExists.ts")}: config.glob: must be a glob pattern, got undefined`],
    ],
    [
      "a metric whose stat doesn't combine its instrument's default score",
      "unfit-stat",
      [
        `${measurement("unfit-stat/measurements/isPrimeTsExists.ts")}: metrics.exists.stat: "mean" doesn't combine fileCreated's default score, a boolean. Use one of: rate, count, or give the metric a score`,
      ],
    ],
    [
      "a measurement without metrics",
      "missing-metrics",
      [`${measurement("missing-metrics/measurements/isPrimeTsExists.ts")}: metrics: must be an object of metrics by name, got undefined`],
    ],
    [
      "a measurement still declaring aggregate",
      "leftover-aggregate",
      [`${measurement("leftover-aggregate/measurements/isPrimeTsExists.ts")}: aggregate: is no longer supported: use metrics, e.g. metrics: { passes: { stat: "rate" } }`],
    ],
    [
      "a bunTestFile measurement whose test is missing",
      "missing-test",
      [
        `${measurement("missing-test/measurements/isPrimeTests.ts")}: config.test: "./isPrime.tset.ts" has no matching ${measurement("missing-test/measurements/isPrime.tset.ts")}`,
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
      "an initial prompt that gives its prompt the old way, as a field",
      "legacy-prompt",
      [`${parameter("tasks/is-prime/initial-prompts/legacy.ts")}: prompt: is no longer read. Write the prompt with the initial prompt's fragment: applyParameter: () => writePrompt(\`…\`).`],
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
      'Error: .thunderjar/parameters/harnessModels/fake-harness-beta/index.ts: version: must be the version of the agent the harness installs, e.g. "2.1.311", got undefined\n',
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
    expect(stderr).toBe(`Error: .thunderjar/parameters/baseImages/ has no base images
Error: .thunderjar/parameters/codeStates/ has no code states
Error: .thunderjar/parameters/promptSets/ has no prompt sets
Error: .thunderjar/parameters/harnessModels/ has no harnesses
Error: .thunderjar/parameters/tasks/ has no tasks
`);
    expect(exitCode).toBe(1);
  });
});

describe("0209 floating code state", () => {
  const MAIN = "24dc11c26e2716a12cf33b82fec895a7f02b3e8a";

  test("shows what each parameter with a resolve resolved to, after the matrix", async () => {
    await using git = await fakeCommand("git", { stdout: `${MAIN}\trefs/heads/main` });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0209"), ["plan", "follow-main"], { env: git.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(`| plain   ${stdout.match(/[0-9a-f]{8}(?=  missing)/)?.[0]}  missing

Resolved
  codeState  follow-main  ${MAIN}
`);
    expect(await git.calls()).toEqual(["ls-remote --exit-code https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git refs/heads/main"]);
  });

  test("a new commit on the branch gives a new hash", async () => {
    await using main = await fakeCommand("git", { stdout: `${MAIN}\trefs/heads/main` });
    await using later = await fakeCommand("git", { stdout: "0123456789abcdef0123456789abcdef01234567\trefs/heads/main" });

    const hashOf = async (env: Record<string, string>) => (await thunderjar(scenario("0209"), ["plan", "follow-main"], { env })).stdout.match(/[0-9a-f]{8}(?=  missing)/)?.[0];

    expect(await hashOf(main.env)).not.toBe(await hashOf(later.env));
    expect(await hashOf(main.env)).toBe(await hashOf(main.env));
  });

  test("a resolve whose command fails is an error naming the parameter", async () => {
    await using git = await fakeCommand("git", { exitCode: 2 });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0209"), ["plan", "follow-main"], { env: git.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      'Error: code state "follow-main": resolve threw: `git ls-remote --exit-code https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git refs/heads/main` exited with 2\n',
    );
    expect(exitCode).toBe(1);
  });
});

describe("0210 build secrets", () => {
  test("stops if a build secret's variable is unset", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0210"), ["plan", "example"], { env: { GITHUB_TOKEN: "" } });

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: Build secret "github" needs GITHUB_TOKEN, which is not set.\nExport it in the shell that runs thunderjar.\n');
    expect(exitCode).toBe(1);
  });

  test("a secret's value is in no hash", async () => {
    const plan = (token: string) => thunderjar(scenario("0210"), ["plan", "example"], { env: { GITHUB_TOKEN: token } });

    const [one, other] = [await plan("one-token"), await plan("another-token")];

    expect(one.exitCode).toBe(0);
    expect(one.stdout).toBe(other.stdout);
  });
});

describe("--json", () => {
  test("0202: the parameters, matrix shape and each permutation, with its hash, prerun image and whether it's built", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "two-harnesses", "--json"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const plan = JSON.parse(stdout);
    expect(plan.testCase).toBe("two-harnesses");
    expect(plan.parameters.task).toBe("is-prime");
    expect(plan.matrixShape).toEqual([1, 1, 1, 2, 1]);
    expect(plan.permutations).toHaveLength(2);
    expect(plan.permutations[0]).toEqual({
      number: 1,
      parameters: expect.objectContaining({ harnessModel: plan.parameters.harnessModel[0] }),
      modelId: expect.any(String),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      prerunImage: expect.stringMatching(/^thunderjar-prerun:[0-9a-f]{8}$/),
      prerunImageStatus: "missing",
      resolved: {},
    });
  });

  test("when Docker can't be reached, each image is unknown, and the warning is on stderr", async () => {
    await using docker = await fakeDocker({ unreachable: true });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["plan", "example", "--json"], { env: { ...docker.env, ...KEY } });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).permutations.map(({ prerunImageStatus }: { prerunImageStatus: string }) => prerunImageStatus)).toEqual(["unknown"]);
    expect(stderr).toStartWith("Warning: Docker can't be reached");
  });
});
