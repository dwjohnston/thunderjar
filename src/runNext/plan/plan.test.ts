/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { config, hash } from "../testing/fixtures.ts";
import { plan, runsFrom } from "./plan.ts";

const SETTINGS = { concurrency: 3, executionId: "01exec" };

describe(plan, () => {
  test("lays out each permutation's iterations together, in plan's order, each with its run ID, container and post-run image", () => {
    const manifest = plan(config({ permutationCount: 2, iterations: 2 }), SETTINGS);

    expect(manifest).toMatchObject({ executionId: "01exec", testCaseName: "example", task: "is-prime", concurrency: 3, buildConcurrency: 1, imageStore: null, overrides: {} });
    expect(manifest.runs).toEqual([
      { runId: "01exec-p1000000-i1", permutationHash: hash("p1"), permutation: 1, iteration: 1, container: "thunderjar-run-01exec-1-1", postrunImage: "thunderjar-postrun:01exec-1-1" },
      { runId: "01exec-p1000000-i2", permutationHash: hash("p1"), permutation: 1, iteration: 2, container: "thunderjar-run-01exec-1-2", postrunImage: "thunderjar-postrun:01exec-1-2" },
      { runId: "01exec-p2000000-i1", permutationHash: hash("p2"), permutation: 2, iteration: 1, container: "thunderjar-run-01exec-2-1", postrunImage: "thunderjar-postrun:01exec-2-1" },
      { runId: "01exec-p2000000-i2", permutationHash: hash("p2"), permutation: 2, iteration: 2, container: "thunderjar-run-01exec-2-2", postrunImage: "thunderjar-postrun:01exec-2-2" },
    ]);
  });

  test("each permutation lists its parameters in layer order, with each one's hash", () => {
    const [permutation] = plan(config(), SETTINGS).permutations;

    expect(permutation?.parameters).toEqual([
      { layer: "baseImage", value: "node20", hash: hash("baseImage1") },
      { layer: "codeState", value: "baseline", hash: hash("codeState1") },
      { layer: "promptSet", value: "none", hash: hash("promptSet1") },
      { layer: "harnessModel", value: "harness-1/model", hash: hash("harnessModel1") },
      { layer: "initialPrompt", value: "plain", hash: hash("initialPrompt1") },
    ]);
  });

  test("without an image store, containers start from the image as it's built", () => {
    const [permutation] = plan(config(), SETTINGS).permutations;

    expect(permutation?.storedPrerunImage).toBeUndefined();
    expect(runsFrom(permutation!)).toBe("thunderjar-prerun:i1000000");
  });

  test("with an image store, each image has where it's pushed, and containers start from there", () => {
    const manifest = plan(config({ imageStore: { repository: "ghcr.io/acme/images" } }), SETTINGS);

    expect(manifest.imageStore).toBe("ghcr.io/acme/images");
    expect(runsFrom(manifest.permutations[0]!)).toBe("ghcr.io/acme/images:prerun-hi1000000");
    expect(manifest.runs[0]?.storedPostrunImage).toBe("ghcr.io/acme/images:postrun-e01exec-hp1000000-i00");
  });

  test("is pure: the same config and settings give the same manifest", () => {
    expect(plan(config({ permutationCount: 2 }), SETTINGS)).toEqual(plan(config({ permutationCount: 2 }), SETTINGS));
  });

  test("records only the overrides given", () => {
    expect(plan(config({ overrides: { iterations: 4, harnessModel: undefined } }), SETTINGS).overrides).toEqual({ iterations: 4 });
  });
});
