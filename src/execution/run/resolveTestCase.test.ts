/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { ConfigError } from "../../config/loader.ts";
import { FakeEnv } from "../../services/Env/FakeEnv.ts";
import { FakeRandom } from "../../services/Random/FakeRandom.ts";
import { scenario } from "../../testing/scenario.ts";
import { resolveTestCase } from "./resolveTestCase.ts";
import type { RunOverrides } from "./types.ts";

const NONE: RunOverrides = { testCase: {} };
const KEY = { FAKE_HARNESS_KEY: "test-key" };

/** Deps for a command run in scenario `id`'s project, with `variables` set. */
const depsIn = (id: string, variables: Record<string, string> = KEY, cwd = scenario(id)) => ({
  env: FakeEnv({ cwd, variables }),
  random: new FakeRandom(),
});

/** The ConfigError `resolveTestCase` throws, failing if it throws none. */
async function configError(name: string, overrides: RunOverrides, deps: ReturnType<typeof depsIn>): Promise<ConfigError> {
  const error = await resolveTestCase(name, overrides, deps).catch((e) => e);
  expect(error).toBeInstanceOf(ConfigError);
  return error as ConfigError;
}

describe(resolveTestCase, () => {
  test("loads a test case and everything its permutations need, in plan order", async () => {
    const config = await resolveTestCase("two-harnesses", NONE, depsIn("0202"));

    expect(config.root).toBe(`${scenario("0202")}/.thunderjar`);
    expect(config.name).toBe("two-harnesses");
    expect(config.testCase.task).toBe("is-prime");
    expect(config.testCase.iterations).toBe(1);
    expect(config.permutations.map((p) => p.hashed.harnessModel)).toEqual([
      "fake-harness-alpha/fake-model-small-001",
      "fake-harness-beta/fake-model-large-001",
    ]);
    expect(config.permutations.map((p) => p.harness)).toEqual([
      { name: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" },
      { name: "fake-harness-beta", version: "1.0.0", modelId: "fake-model-large-001" },
    ]);
    // Alpha needs a key; beta needs nothing.
    expect(config.permutations.map((p) => p.harnessEnv)).toEqual([["FAKE_HARNESS_KEY"], []]);
    expect(config.permutations.map((p) => p.timeoutSeconds)).toEqual([600, 600]);
    expect(config.permutations.map((p) => p.runOptions)).toEqual([[], []]);
    expect(config.permutations[1]!.parameterFolders).toEqual({
      baseImage: "parameters/baseImages/node20",
      codeState: "parameters/codeStates/baseline",
      promptSet: "parameters/promptSets/snerk",
      harness: "parameters/harnessModels/fake-harness-beta",
    });
    for (const { hashed } of config.permutations) {
      expect(hashed.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hashed.imageHash).toMatch(/^[0-9a-f]{64}$/);
      expect(hashed.dockerfile).toContain("FROM ");
    }
  });

  test("defaults: Thunderjar's image prefix, no image store, no runtime, no overrides, no timings, no warnings", async () => {
    const config = await resolveTestCase("example", NONE, depsIn("0202"));
    expect(config.imagePrefix).toBe("thunderjar");
    expect(config.imageStore).toBeNull();
    expect(config.runtime).toBeNull();
    expect(config.build).toEqual({ secrets: [], ssh: false, concurrency: 1 });
    expect(config.overrides).toEqual({});
    expect(config.concurrency).toBeUndefined();
    expect(config.dataDir).toBeUndefined();
    expect(config.timings).toBe(false);
    expect(config.warnings).toEqual([]);
  });

  test("the execution ID is the next ULID of the Random it's given", async () => {
    const deps = depsIn("0202");
    deps.random.setUlids("01hexecution000000000000000");
    expect((await resolveTestCase("example", NONE, deps)).executionId).toBe("01hexecution000000000000000");
  });

  test("finds the project from a folder inside it", async () => {
    const config = await resolveTestCase("example", NONE, depsIn("0202", KEY, `${scenario("0202")}/.thunderjar/parameters/tasks`));
    expect(config.root).toBe(`${scenario("0202")}/.thunderjar`);
  });

  test("test case overrides are applied to the declaration, and kept as given", async () => {
    const config = await resolveTestCase("example", { testCase: { promptSet: ["glurk"], iterations: 3, baseImage: undefined } }, depsIn("0202"));
    expect(config.testCase.promptSet).toEqual(["glurk"]);
    expect(config.testCase.iterations).toBe(3);
    expect(config.overrides).toEqual({ promptSet: ["glurk"], iterations: 3 });
    expect(config.permutations.map((p) => p.hashed.promptSet)).toEqual(["glurk"]);
    expect(config.permutations[0]!.parameterFolders.promptSet).toBe("parameters/promptSets/glurk");
  });

  test("machine-level overrides are carried into the config", async () => {
    const config = await resolveTestCase("example", { testCase: {}, concurrency: 3, timings: true, imagePrefix: "mine", dataDir: "elsewhere" }, depsIn("0202"));
    expect(config.concurrency).toBe(3);
    expect(config.timings).toBe(true);
    expect(config.imagePrefix).toBe("mine");
    expect(config.dataDir).toBe("elsewhere");
  });

  test("a base image's run options are its permutations'", async () => {
    const config = await resolveTestCase("sandboxed", NONE, depsIn("0206"));
    expect(config.permutations.map((p) => [p.hashed.baseImage, p.runOptions])).toEqual([
      ["node20", []],
      ["node20-unconfined", ["--security-opt", "seccomp=unconfined", "--security-opt", "apparmor=unconfined"]],
    ]);
  });

  test("the project config's image store and runtime, with the runtime's defaults", async () => {
    const config = await resolveTestCase("example", NONE, depsIn("0211"));
    expect(config.imageStore).toEqual({ repository: "ghcr.io/acme/thunderjar-images" });
    expect(config.runtime?.command.slice(1)).toEqual(["--context", "cloud"]);
    expect(config.runtime?.concurrency).toBe(1);
    // Only the fields `run` uses.
    expect(Object.keys(config.runtime ?? {}).sort()).toEqual(["command", "concurrency"]);
  });

  test("the project config's build options, once its secrets are set", async () => {
    const config = await resolveTestCase("example", NONE, depsIn("0210", { ...KEY, GITHUB_TOKEN: "test-token" }));
    expect(config.build).toEqual({ secrets: [{ id: "github", env: "GITHUB_TOKEN" }], ssh: true, concurrency: 1 });
  });

  test("a build secret that isn't set is a ConfigError naming it", async () => {
    const error = await configError("example", NONE, depsIn("0210"));
    expect(error.message).toContain("GITHUB_TOKEN");
  });

  test("a variable a harness needs that isn't set is a ConfigError naming it: only the Env's variables count", async () => {
    const error = await configError("example", NONE, depsIn("0202", {}));
    expect(error.message).toContain("FAKE_HARNESS_KEY");
  });

  test("not for runs: a variable only an agent needs may be unset, and its harness still names it", async () => {
    const config = await resolveTestCase("two-harnesses", NONE, depsIn("0202", {}), { forRuns: false });

    expect(config.permutations[0]?.harnessEnv).toEqual(["FAKE_HARNESS_KEY"]);
  });

  test("a test case that doesn't exist is a ConfigError", async () => {
    const error = await configError("no-such-case", NONE, depsIn("0202"));
    expect(error.message).toContain("no-such-case");
  });

  test("an override naming a parameter that doesn't exist is a ConfigError", async () => {
    const error = await configError("example", { testCase: { promptSet: ["nope"] } }, depsIn("0202"));
    expect(error.message).toContain('"nope"');
  });

  test("a folder with no project is a ConfigError saying to run init", async () => {
    // Not a fixture: those sit under this repository's own .thunderjar/.
    const error = await configError("example", NONE, depsIn("0202", KEY, "/"));
    expect(error.message).toContain("thunderjar init");
  });

  test("broken declarations are a ConfigError listing each problem", async () => {
    const error = await configError("unknown-prompt-set", NONE, depsIn("0402"));
    expect(error.problems.length).toBeGreaterThan(0);
    expect(error.problems[0]).toContain(".thunderjar/test-cases/unknown-prompt-set.ts");
  });
});
