/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { fakePermutation, fakeTestCase, IMAGE_STORE } from "../testing/fakeDependencies.ts";
import { plan } from "./plan.ts";

const settings = { concurrency: 3, executionId: "exec" };

describe(plan, () => {
  test("carries the execution ID, the test case's name and task, and the concurrency", () => {
    const config = fakeTestCase();

    const manifest = plan(config, settings);

    expect(manifest.executionId).toBe("exec");
    expect(manifest.testCaseName).toBe("greeting");
    expect(manifest.task).toBe("greet");
    expect(manifest.concurrency).toBe(3);
    expect(manifest.config).toBe(config);
  });

  test("numbers the permutations from 1, in the config's order", () => {
    const manifest = plan(fakeTestCase({ permutations: ["a", "b"] }), settings);

    expect(manifest.permutations.map(({ number, hash, modelId }) => ({ number, hash, modelId }))).toEqual([
      { number: 1, hash: "aaaaaaaaaaaaaaaa", modelId: "model-a" },
      { number: 2, hash: "bbbbbbbbbbbbbbbb", modelId: "model-b" },
    ]);
  });

  test("lists each permutation's parameters in layer order, with their hashes", () => {
    const [permutation] = plan(fakeTestCase(), settings).permutations;

    expect(permutation?.parameters).toEqual([
      { layer: "baseImage", value: "base", hash: "h-base" },
      { layer: "codeState", value: "code", hash: "h-code" },
      { layer: "promptSet", value: "prompts", hash: "h-prompts" },
      { layer: "harnessModel", value: "echo/model-a", hash: "h-echo" },
      { layer: "initialPrompt", value: "plain", hash: "h-plain" },
    ]);
  });

  test("a parameter that resolved to something carries it", () => {
    const resolved = fakePermutation("a");
    resolved.hashed.resolved = { codeState: { commit: "abc123" } };

    const [permutation] = plan(fakeTestCase({ permutations: [resolved] }), settings).permutations;

    expect(permutation?.parameters.find(({ layer }) => layer === "codeState")?.resolved).toEqual({ commit: "abc123" });
    expect(permutation?.parameters.find(({ layer }) => layer === "baseImage")).not.toHaveProperty("resolved");
  });

  test("names the pre-run image after the prefix and the abbreviated image hash", () => {
    const [permutation] = plan(fakeTestCase({ imagePrefix: "tj", permutations: [fakePermutation("a", "c")] }), settings).permutations;

    expect(permutation?.prerunImage).toBe("tj-prerun:cccccccc");
  });

  test("permutations with the same image hash share one pre-run image", () => {
    const manifest = plan(fakeTestCase({ permutations: [fakePermutation("a", "c"), fakePermutation("b", "c")] }), settings);

    expect(manifest.permutations.map(({ prerunImage }) => prerunImage)).toEqual(["tj-prerun:cccccccc", "tj-prerun:cccccccc"]);
  });

  test("gives each permutation the test case's env and secretEnv", () => {
    const [permutation] = plan(fakeTestCase({ testCaseEnv: { COLOUR: "blue" }, secretEnv: ["PASSWORD"] }), settings).permutations;

    expect(permutation?.testCaseEnv).toEqual({ COLOUR: "blue" });
    expect(permutation?.secretEnv).toEqual(["PASSWORD"]);
  });

  describe("runs", () => {
    test("one per permutation per iteration, a permutation's iterations together", () => {
      const manifest = plan(fakeTestCase({ permutations: ["a", "b"], iterations: 3 }), settings);

      expect(manifest.runs.map(({ runId }) => runId)).toEqual(["exec-1-1", "exec-1-2", "exec-1-3", "exec-2-1", "exec-2-2", "exec-2-3"]);
      expect(manifest.runs.map(({ iteration }) => iteration)).toEqual([1, 2, 3, 1, 2, 3]);
    });

    test("each run points at its permutation", () => {
      const manifest = plan(fakeTestCase({ permutations: ["a", "b"], iterations: 2 }), settings);

      expect(manifest.runs.map(({ permutationHash }) => permutationHash)).toEqual(["aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb"]);
      expect(manifest.runs[2]?.permutation).toBe(manifest.permutations[1]!);
    });

    test("names each run's container and post-run image after the execution, permutation and iteration", () => {
      const manifest = plan(fakeTestCase({ permutations: ["a", "b"], iterations: 2 }), settings);

      const last = manifest.runs.at(-1);
      expect(last?.container).toBe("tj-run-exec-2-2");
      expect(last?.postrunImage).toBe("tj-postrun:exec-2-2");
    });

    test("no iterations, no runs", () => {
      expect(plan(fakeTestCase({ iterations: 0 }), settings).runs).toEqual([]);
    });
  });

  describe("without an image store", () => {
    test("nothing has a stored reference, and containers start from the local pre-run image", () => {
      const manifest = plan(fakeTestCase(), settings);

      expect(manifest.permutations[0]).not.toHaveProperty("storedPrerunImage");
      expect(manifest.runs[0]).not.toHaveProperty("storedPostrunImage");
      expect(manifest.permutations[0]?.runImage).toBe("tj-prerun:aaaaaaaa");
    });

    test("a runtime's containers start from the local pre-run image too: it was built there", () => {
      const manifest = plan(fakeTestCase({ runtime: { command: ["docker", "--context", "cloud"] } }), settings);

      expect(manifest.permutations[0]?.runImage).toBe("tj-prerun:aaaaaaaa");
    });
  });

  describe("with an image store", () => {
    test("each pre-run image is stored under its abbreviated image hash", () => {
      const manifest = plan(fakeTestCase({ imageStore: IMAGE_STORE }), settings);

      expect(manifest.permutations[0]?.storedPrerunImage).toBe("registry.example.com/team/images:prerun-haaaaaaaa");
    });

    test("each post-run image is stored under the execution, the permutation hash and the iteration, counted from 0", () => {
      const manifest = plan(fakeTestCase({ imageStore: IMAGE_STORE, permutations: ["a", "b"], iterations: 2 }), settings);

      expect(manifest.runs.map(({ storedPostrunImage }) => storedPostrunImage)).toEqual([
        "registry.example.com/team/images:postrun-eexec-haaaaaaaa-i00",
        "registry.example.com/team/images:postrun-eexec-haaaaaaaa-i01",
        "registry.example.com/team/images:postrun-eexec-hbbbbbbbb-i00",
        "registry.example.com/team/images:postrun-eexec-hbbbbbbbb-i01",
      ]);
    });

    test("on this machine, containers start from the local pre-run image", () => {
      const manifest = plan(fakeTestCase({ imageStore: IMAGE_STORE, runtime: null }), settings);

      expect(manifest.permutations[0]?.runImage).toBe("tj-prerun:aaaaaaaa");
    });

    test("on a runtime, containers start from the stored pre-run image", () => {
      const manifest = plan(fakeTestCase({ imageStore: IMAGE_STORE, runtime: { command: ["docker", "--context", "cloud"] } }), settings);

      expect(manifest.permutations[0]?.runImage).toBe("registry.example.com/team/images:prerun-haaaaaaaa");
    });
  });
});
