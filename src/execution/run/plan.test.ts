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

import { describe, expect, it } from "bun:test";
import type { TestCaseDeclaration } from "../../api/declarations.ts";
import type { HashedPermutation } from "../../config/permutations.ts";
import { plan } from "./plan.ts";
import type { ResolvedPermutation, TestCaseConfig } from "./types.ts";

const EXECUTION = "01HZX0000000000000000000AA";

// Hashes are long so the tests show which names carry the abbreviation (8 characters).
const hashOf = (letter: string) => letter.repeat(64);

function aPermutation(letter: string, overrides: Partial<HashedPermutation> = {}, resolved: Partial<ResolvedPermutation> = {}): ResolvedPermutation {
  return {
    hashed: {
      baseImage: "node",
      codeState: "empty",
      promptSet: "none",
      harnessModel: "robot-1/small",
      initialPrompt: "hello",
      hash: hashOf(letter),
      parameterHashes: { baseImage: "pb", codeState: "pc", promptSet: "pp", harnessModel: "ph", initialPrompt: "pi" },
      modelId: "small",
      imageHash: hashOf(letter.toUpperCase()),
      dockerfile: `FROM node\n# ${letter}\n`,
      resolved: {},
      ...overrides,
    },
    harness: { name: "robot-1", version: "1.0.0", modelId: "small" },
    harnessEnv: ["ROBOT_KEY"],
    runOptions: ["--init"],
    timeoutSeconds: 60,
    parameterFolders: {
      baseImage: "parameters/baseImages/node",
      codeState: "parameters/codeStates/empty",
      promptSet: "parameters/promptSets/none",
      harness: "parameters/harnessModels/robot-1",
    },
    ...resolved,
  };
}

const TEST_CASE: TestCaseDeclaration = {
  baseImage: ["node"],
  codeState: ["empty"],
  promptSet: ["none"],
  harnessModel: ["robot-1/small"],
  task: "greet",
  initialPrompt: ["hello", "hi"],
  iterations: 2,
} as unknown as TestCaseDeclaration;

function aConfig(overrides: Partial<TestCaseConfig> = {}): TestCaseConfig {
  return {
    root: "/project/.thunderjar",
    name: "example",
    testCase: TEST_CASE,
    overrides: {},
    executionId: EXECUTION,
    permutations: [aPermutation("a"), aPermutation("b", { initialPrompt: "hi" })],
    imagePrefix: "thunderjar",
    imageStore: null,
    build: { secrets: [], ssh: false, concurrency: 1 },
    runtime: null,
    timings: false,
    warnings: [],
    ...overrides,
  };
}

const STORE = { repository: "registry.example/acme/images" };
const RUNTIME = { command: ["ssh", "box"], concurrency: 3 };

describe("plan", () => {
  it("copies the execution's own facts from the config and settings", () => {
    const manifest = plan(aConfig({ dataDir: "/data", timings: true }), { concurrency: 5 });

    expect(manifest).toMatchObject({
      executionId: EXECUTION,
      root: "/project/.thunderjar",
      testCase: "example",
      task: "greet",
      concurrency: 5,
      buildConcurrency: 1,
      imagePrefix: "thunderjar",
      imageStore: null,
      remote: false,
      dataDir: "/data",
      timings: true,
    });
  });

  it("gives the same manifest for the same config", () => {
    expect(plan(aConfig(), { concurrency: 2 })).toEqual(plan(aConfig(), { concurrency: 2 }));
  });

  it("is plain data: it survives JSON", () => {
    const manifest = plan(aConfig({ imageStore: STORE, runtime: RUNTIME }), { concurrency: 2 });

    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("records the matrix as the execution record keeps it", () => {
    expect(plan(aConfig(), { concurrency: 1 }).matrix).toEqual({ shape: [1, 1, 1, 1, 2], permutations: 2, iterations: 2 });
  });

  it("takes env, secretEnv, build options and build concurrency from the config", () => {
    const testCase = { ...TEST_CASE, env: { MODE: "quiet" }, secretEnv: ["TOKEN", "TOKEN", "OTHER"] } as TestCaseDeclaration;
    const build = { secrets: [{ id: "github", env: "GH" }], ssh: true, concurrency: 4 };

    const manifest = plan(aConfig({ testCase, build }), { concurrency: 1 });

    expect(manifest.env).toEqual({ MODE: "quiet" });
    expect(manifest.secretEnv).toEqual(["TOKEN", "OTHER"]);
    expect(manifest.build).toEqual({ secrets: [{ id: "github", env: "GH" }], ssh: true });
    expect(manifest.buildConcurrency).toBe(4);
  });

  describe("overrides", () => {
    it("are left out when none is given", () => {
      expect("overrides" in plan(aConfig({ overrides: { iterations: undefined } }), { concurrency: 1 })).toBe(false);
    });

    it("are kept, without those left unset", () => {
      const manifest = plan(aConfig({ overrides: { iterations: 2, promptSet: undefined } }), { concurrency: 1 });

      expect(manifest.overrides).toEqual({ iterations: 2 });
    });
  });

  describe("hooks", () => {
    it("are empty with no runtime", () => {
      expect(plan(aConfig(), { concurrency: 1 }).hooks).toEqual({});
    });

    it("are the runtime's", () => {
      const runtime = { ...RUNTIME, beforeExecution: ["./up.sh"], afterExecution: ["./down.sh", "--all"] };

      const manifest = plan(aConfig({ runtime }), { concurrency: 1 });

      expect(manifest.hooks).toEqual({ beforeExecution: ["./up.sh"], afterExecution: ["./down.sh", "--all"] });
      expect(manifest.remote).toBe(true);
    });
  });

  describe("permutations", () => {
    it("are numbered from 1, in the config's order", () => {
      const manifest = plan(aConfig(), { concurrency: 1 });

      expect(manifest.permutations.map((permutation) => [permutation.number, permutation.hash])).toEqual([
        [1, hashOf("a")],
        [2, hashOf("b")],
      ]);
    });

    it("list their parameters in layer order", () => {
      const resolved = { codeState: { commit: "abc" } } as unknown as HashedPermutation["resolved"];
      const manifest = plan(aConfig({ permutations: [aPermutation("a", { resolved })] }), { concurrency: 1 });

      expect(manifest.permutations[0]?.parameters).toEqual([
        { axis: "baseImage", name: "node", parameterHash: "pb" },
        { axis: "codeState", name: "empty", parameterHash: "pc", resolved: { commit: "abc" } },
        { axis: "promptSet", name: "none", parameterHash: "pp" },
        { axis: "harnessModel", name: "robot-1/small", parameterHash: "ph" },
        { axis: "initialPrompt", name: "hello", parameterHash: "pi" },
      ]);
    });

    it("carry what their containers are run with", () => {
      const manifest = plan(aConfig(), { concurrency: 1 });

      expect(manifest.permutations[0]).toMatchObject({
        imageHash: hashOf("A"),
        prerunImage: "thunderjar-prerun:AAAAAAAA",
        harness: { name: "robot-1", version: "1.0.0", modelId: "small" },
        harnessEnv: ["ROBOT_KEY"],
        runOptions: ["--init"],
        timeoutSeconds: 60,
      });
    });
  });

  describe("images", () => {
    it("are one per image hash, the first permutation's, in plan order", () => {
      const permutations = [
        aPermutation("a", { imageHash: hashOf("X"), dockerfile: "first" }),
        aPermutation("b", { imageHash: hashOf("Y"), dockerfile: "other" }),
        aPermutation("c", { imageHash: hashOf("X"), dockerfile: "ignored" }),
      ];

      const manifest = plan(aConfig({ permutations }), { concurrency: 1 });

      expect(manifest.images.map((image) => [image.imageHash, image.dockerfile])).toEqual([
        [hashOf("X"), "first"],
        [hashOf("Y"), "other"],
      ]);
      expect(manifest.permutations.map((permutation) => permutation.prerunImage)).toEqual([
        "thunderjar-prerun:XXXXXXXX",
        "thunderjar-prerun:YYYYYYYY",
        "thunderjar-prerun:XXXXXXXX",
      ]);
    });

    it("are named with the image prefix, and run from there, with no image store", () => {
      const [image] = plan(aConfig({ imagePrefix: "mine", runtime: RUNTIME }), { concurrency: 1 }).images;

      expect(image?.image).toBe("mine-prerun:AAAAAAAA");
      expect(image?.runFrom).toBe("mine-prerun:AAAAAAAA");
      expect(image !== undefined && "stored" in image).toBe(false);
    });

    it("have a stored reference with an image store, but run from the local name on the host", () => {
      const [image] = plan(aConfig({ imageStore: STORE }), { concurrency: 1 }).images;

      expect(image?.stored).toBe("registry.example/acme/images:prerun-hAAAAAAAA");
      expect(image?.runFrom).toBe("thunderjar-prerun:AAAAAAAA");
    });

    it("run from the stored reference on a remote runtime", () => {
      const manifest = plan(aConfig({ imageStore: STORE, runtime: RUNTIME }), { concurrency: 1 });

      expect(manifest.images[0]?.runFrom).toBe("registry.example/acme/images:prerun-hAAAAAAAA");
      expect(manifest.permutations[0]?.prerunImage).toBe("registry.example/acme/images:prerun-hAAAAAAAA");
    });

    it("name the folders their build context is made from", () => {
      const [image] = plan(aConfig(), { concurrency: 1 }).images;

      expect(image?.context).toEqual([
        { role: "baseImage", from: "parameters/baseImages/node", to: "parameters/baseImage" },
        { role: "codeState", from: "parameters/codeStates/empty", to: "parameters/codeState" },
        { role: "promptSet", from: "parameters/promptSets/none", to: "parameters/promptSet" },
        { role: "harness", from: "parameters/harnessModels/robot-1", to: "parameters/harness" },
      ]);
    });
  });

  describe("runs", () => {
    it("are every iteration of every permutation, grouped by permutation", () => {
      const manifest = plan(aConfig(), { concurrency: 1 });

      expect(manifest.runs.map((run) => [run.permutation, run.iteration, run.permutationHash])).toEqual([
        [1, 1, hashOf("a")],
        [1, 2, hashOf("a")],
        [2, 1, hashOf("b")],
        [2, 2, hashOf("b")],
      ]);
    });

    it("are named as the other commands expect", () => {
      const manifest = plan(aConfig({ imagePrefix: "mine" }), { concurrency: 1 });

      expect(manifest.runs[3]).toEqual({
        runId: `${EXECUTION}-bbbbbbbb-i2`,
        permutationHash: hashOf("b"),
        permutation: 2,
        iteration: 2,
        container: `mine-run-${EXECUTION}-2-2`,
        postrunImage: `mine-postrun:${EXECUTION}-2-2`,
      });
    });

    it("have a stored postrun image with an image store", () => {
      const manifest = plan(aConfig({ imageStore: STORE }), { concurrency: 1 });

      expect(manifest.runs[1]?.storedPostrunImage).toBe(`registry.example/acme/images:postrun-e${EXECUTION}-haaaaaaaa-i01`);
    });
  });
});
