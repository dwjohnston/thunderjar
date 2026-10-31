// `thunderjar plan`, through the CLI, in the checked-in fixtureTests/ scenarios, in place. Each
// asserts on stdout, against the recording fake Docker, which says which prerun images exist. Any
// of these can be run by hand:
//
//   bun run fixture scenario_2 plan is-prime-baseline

import { describe, expect, test } from "bun:test";
import { fakeDocker, scenario, thunderjar } from "../../../testing/cli.ts";

const prerunTags = (stdout: string) => stdout.match(/prerun-h[0-9a-f]{8}/g);

describe("scenario_1_minimal_initial_setup", () => {
  const fixtures = scenario("scenario_1_minimal_initial_setup");

  test("plan example: a 1/1/1/1/1 test case has one permutation", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "example"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`baseImage:     node20 (26d9745f)
codeState:     baseline (bb1584cd)
promptSet:     snerk (827aa0ce)
harnessModel:  fake-harness-alpha@1.0.0/fake-model-small (da287975)
task:          is-prime
initialPrompt: plain (9e30b385)

Matrix shape: 1/1/1/1/1 (1 permutation × 1 iteration = 1 container run)

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
    prerun-h8ffdda6e (will build)
`);
  });
});

describe("scenario_2_typical_project", () => {
  const fixtures = scenario("scenario_2_typical_project");

  // spec/100-cli-reference.md#plan, with the scenario's real hashes. The scenario is deterministic,
  // so these are exact: a changed hash is a change to execution identity, a tripwire to investigate
  // rather than loosen (spec/120-test-boundaries.md). Regenerate them deliberately, in the change
  // that alters the scenario or the hashing.
  const IS_PRIME_BASELINE = `baseImage:     node20 (26d9745f)
codeState:     baseline (bb1584cd)
promptSet:     snerk (827aa0ce), glurk (a4ecb061)
harnessModel:  fake-harness-alpha@1.0.0/fake-model-small (da287975), fake-harness-beta@1.0.0/fake-model-large (832747bd)
task:          is-prime
initialPrompt: plain (9e30b385), terse (7bb8874f)

Matrix shape: 1/1/2/2/2 (8 permutations × 5 iterations = 40 container runs)

 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
    prerun-h8ffdda6e (will build)

 2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
    prerun-hefe85dda (will build)

 3  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | plain
    prerun-h8baa2cff (will build)

 4  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
    prerun-h56ea4852 (will build)

 5  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | plain
    prerun-hfaa55eaf (will build)

 6  node20 | baseline | glurk | fake-harness-alpha@1.0.0/fake-model-small | terse
    prerun-h3e2038b8 (will build)

 7  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | plain
    prerun-h09fa95b9 (will build)

 8  node20 | baseline | glurk | fake-harness-beta@1.0.0/fake-model-large  | terse
    prerun-he7379c79 (will build)`;

  test("plan is-prime-baseline prints the parameters with their hashes, and each permutation's prerun image", async () => {
    const docker = await fakeDocker();
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "is-prime-baseline"], docker.env);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${IS_PRIME_BASELINE}\n`);
  });

  test("plan glurk-on-node-lts: a renamed parameter keeps its hash; one whose file differs doesn't", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "glurk-on-node-lts"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    // node-lts is node20 under another name, so it has node20's hash, and glurk on it has the same
    // prerun image as on node20 (entry 8 of is-prime-baseline). glurk-reworded is glurk with its
    // FAKE_INSTRUCTIONS.md beside the declaration edited, so its hash and prerun image differ.
    expect(stdout).toContain("baseImage:     node-lts (26d9745f)\n");
    expect(stdout).toContain("promptSet:     glurk (a4ecb061), glurk-reworded (88256825)\n");
    expect(prerunTags(stdout)).toEqual(["prerun-he7379c79", "prerun-h2960067a"]);
    expect(prerunTags(IS_PRIME_BASELINE)).not.toContain("prerun-h2960067a");
  });

  test("plan with an unknown test case says so", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "no-such-test-case"]);

    expect(stdout).toBe("");
    expect(stderr).toBe(
      `error: no test case named "no-such-test-case" (expected ${fixtures}/.thunderjar/test-cases/no-such-test-case.ts)\n`,
    );
    expect(exitCode).toBe(1);
  });

  test("a prerun image that already exists is shown as reused; the rest as built", async () => {
    const docker = await fakeDocker(["thunderjar:prerun-h8ffdda6e", "thunderjar:prerun-he7379c79"]);
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "is-prime-baseline"], docker.env);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout.split("\n").filter((line) => line.includes("prerun-h"))).toEqual([
      "    prerun-h8ffdda6e (exists, reused)",
      "    prerun-hefe85dda (will build)",
      "    prerun-h8baa2cff (will build)",
      "    prerun-h56ea4852 (will build)",
      "    prerun-hfaa55eaf (will build)",
      "    prerun-h3e2038b8 (will build)",
      "    prerun-h09fa95b9 (will build)",
      "    prerun-he7379c79 (exists, reused)",
    ]);
  });

  test("without Docker, plan still prints, and says whether images exist is unknown", async () => {
    const docker = await fakeDocker([], ["unreachable"]);
    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "is-prime-baseline"], docker.env);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(
      `${IS_PRIME_BASELINE.replaceAll(" (will build)", "")}\n\n` +
        "Docker can't be reached (Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?), so whether each prerun image exists is unknown.\n",
    );
  });

  test("plan --image-prefix looks up each prerun image under the prefix", async () => {
    const docker = await fakeDocker(["throwaway:prerun-hefe85dda", "thunderjar:prerun-h56ea4852"]);

    const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["plan", "two-pairs", "--image-prefix", "throwaway"], docker.env);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    // Only the image under the prefix counts; the one under the default prefix doesn't.
    expect(stdout).toContain("    prerun-hefe85dda (exists, reused)\n");
    expect(stdout).toContain("    prerun-h56ea4852 (will build)\n");
    expect(docker.commands()).toEqual([
      "docker version --format {{.Server.Version}}",
      "docker image inspect --format {{.Id}} throwaway:prerun-hefe85dda",
      "docker image inspect --format {{.Id}} throwaway:prerun-h56ea4852",
    ]);
  });

  test("plan with no test case, or --image-prefix without a name, prints its usage", async () => {
    for (const args of [["plan"], ["plan", "two-pairs", "--image-prefix"], ["plan", "two-pairs", "extra"]]) {
      const { stderr, exitCode } = await thunderjar(fixtures, args);
      expect(stderr).toBe("usage: thunderjar plan <test case> [--image-prefix <name>]\n");
      expect(exitCode).toBe(1);
    }
  });
});
