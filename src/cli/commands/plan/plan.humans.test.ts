// The canonical behaviour of `thunderjar plan`. Maintained by humans: see HUMANS.md.
import { describe, expect, test } from "bun:test";
import { thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

/** What 0202's fake-harness-alpha needs: `plan` and `run` stop without it. */
const KEY = { FAKE_HARNESS_KEY: "fake-key" };

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
        "thunderjar-prerun:ded54607",
        "thunderjar-prerun:602318c8",
        "thunderjar-prerun:e4f0784f",
        "thunderjar-prerun:35965dab",
        "other-prerun:3b9c542f",
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


    expect(plan).toMatchInlineSnapshot(`
      {
        "env": {},
        "matrixShape": [
          1,
          1,
          1,
          2,
          1,
        ],
        "parameters": {
          "baseImage": [
            "node20",
          ],
          "codeState": [
            "baseline",
          ],
          "harnessModel": [
            "fake-harness-alpha/fake-model-small-001",
            "fake-harness-beta/fake-model-large-001",
          ],
          "initialPrompt": [
            "plain",
          ],
          "promptSet": [
            "snerk",
          ],
          "task": "is-prime",
        },
        "permutations": [
          {
            "hash": "bef6be59e0075f3bc210d929098246bb6b2e437acfcc81fe71dd66e5581b7953",
            "modelId": "fake-model-small-001",
            "number": 1,
            "parameters": {
              "baseImage": "node20",
              "codeState": "baseline",
              "harnessModel": "fake-harness-alpha/fake-model-small-001",
              "initialPrompt": "plain",
              "promptSet": "snerk",
            },
            "prerunImage": "thunderjar-prerun:ded54607",
            "prerunImageStatus": "missing",
            "resolved": {},
          },
          {
            "hash": "6200c2337c98d56cf6d7cf3c1ae2958b79e5b0b8bf828ec25621f4692991db54",
            "modelId": "fake-model-large-001",
            "number": 2,
            "parameters": {
              "baseImage": "node20",
              "codeState": "baseline",
              "harnessModel": "fake-harness-beta/fake-model-large-001",
              "initialPrompt": "plain",
              "promptSet": "snerk",
            },
            "prerunImage": "thunderjar-prerun:e4f0784f",
            "prerunImageStatus": "missing",
            "resolved": {},
          },
        ],
        "secretEnv": [],
        "testCase": "two-harnesses",
      }
    `)
  });
});
