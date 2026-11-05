// `thunderjar build --dry-run`, through the CLI. It only reads the project, so it runs on the
// scenarios unchanged. Any of these can be run by hand, e.g. `bun run fixture 0202 build example --dry-run`.
import { describe, expect, test } from "bun:test";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

const SNERK = `RUN echo "Write small functions, and say what each one is for." > /workspace/FAKE_INSTRUCTIONS.md`;
const GLURK = `RUN echo "Prefer one clear expression to a loop." > /workspace/FAKE_INSTRUCTIONS.md`;

/** The dry run's block for the prerun image of `hash`. */
const image = (hash: string, promptSet: string, harness: string, prefix = "thunderjar") => `# ${prefix}-prerun:${hash}
FROM node:20-bookworm
WORKDIR /workspace
${promptSet}
RUN echo "install ${harness}@1.0.0"`;

describe("0202 typical project", () => {
  test("is-prime-baseline: each prerun image, in plan's order, then its Dockerfile", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${image("45bcf0be", SNERK, "fake-harness-alpha")}

${image("fc556cc9", SNERK, "fake-harness-alpha")}

${image("90abcb0a", SNERK, "fake-harness-beta")}

${image("775c8f66", SNERK, "fake-harness-beta")}

${image("cda1818b", GLURK, "fake-harness-alpha")}

${image("67844e9a", GLURK, "fake-harness-alpha")}

${image("df1934bd", GLURK, "fake-harness-beta")}

${image("f4979542", GLURK, "fake-harness-beta")}
`);
  });

  test("asks Docker nothing, so builds nothing, even when Docker can't be reached", async () => {
    await using docker = await fakeDocker({ unreachable: true });

    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--dry-run"], {
      env: docker.env,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(await docker.commands()).toEqual([]);
  });

  test("--image-prefix starts every image name with it", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), [
      "build",
      "example",
      "--dry-run",
      "--image-prefix",
      "throwaway",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${image("45bcf0be", SNERK, "fake-harness-alpha", "throwaway")}\n`);
  });

  test("an --image-prefix Docker wouldn't accept is an error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), [
      "build",
      "example",
      "--dry-run",
      "--image-prefix",
      "Throw/away",
    ]);

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "error: option '--image-prefix <name>' argument 'Throw/away' is invalid. It must be lowercase letters and digits, joined by single separators (., _, __ or -), as a Docker repository name is.\n",
    );
    expect(exitCode).toBe(1);
  });

  test("an unknown test case is a configuration error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "missing", "--dry-run"]);

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: No test case named "missing": expected .thunderjar/test-cases/missing.ts.\n');
    expect(exitCode).toBe(1);
  });

  test("without --dry-run, it says only a dry run is possible so far, and asks Docker nothing", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: Building images is not implemented yet; use --dry-run.\n");
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });
});

describe("0201 minimal existing setup", () => {
  test("example: its one prerun image", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["build", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`# thunderjar-prerun:e943919c
FROM node:20-bookworm
WORKDIR /workspace
RUN echo "install fake-harness-alpha@1.0.0"
`);
  });

  test("permutations with the same hash share one image, printed once", async () => {
    await using copy = await copyScenarioProject("0201");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-cases/twice.ts`,
      (await Bun.file(`${copy.dir}/.thunderjar/test-cases/example.ts`).text()).replace(
        'promptSet: ["snerk"]',
        'promptSet: ["snerk", "snerk"]',
      ),
    );

    const plan = await thunderjar(copy.dir, ["plan", "twice"]);
    const { stdout, exitCode } = await thunderjar(copy.dir, ["build", "twice", "--dry-run"]);

    expect(plan.stdout).toContain("(2 permutations)");
    expect(exitCode).toBe(0);
    expect(stdout.match(/^# .*$/gm)).toEqual(["# thunderjar-prerun:e943919c"]);
  });
});
