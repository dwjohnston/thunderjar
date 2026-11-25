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

// The planner: every permutation and run of a test case. Pure.
import { AXES } from "../../config/permutations.ts";
import { containerName, postrunImage, prerunImage, storedPostrunImage, storedPrerunImage } from "../../execution/images.ts";
import type { Manifest, PlannedPermutation, PlannedRun, TestCaseConfig } from "../types.ts";

/**
 * The execution ID is passed in rather than made here, so `plan` stays pure. Open: the architecture
 * plan has only `concurrency` in `settings`.
 */
export function plan(config: TestCaseConfig, settings: { concurrency: number; executionId: string }): Manifest {
  const { executionId } = settings;
  const { imagePrefix, imageStore } = config;
  const permutations: PlannedPermutation[] = config.permutations.map((resolved, p) => {
    const { hashed } = resolved;
    const local = prerunImage(hashed.imageHash, imagePrefix);
    const stored = imageStore === null ? undefined : storedPrerunImage(imageStore.repository, hashed.imageHash);
    return {
      ...resolved,
      number: p + 1,
      hash: hashed.hash,
      parameters: AXES.map((layer) => ({
        layer,
        value: hashed[layer],
        hash: hashed.parameterHashes[layer],
        ...(hashed.resolved[layer] !== undefined && { resolved: hashed.resolved[layer] }),
      })),
      prerunImage: local,
      ...(stored !== undefined && { storedPrerunImage: stored }),
      // A remote runtime runs each pre-run image as the image store has it.
      runImage: config.runtime !== null && stored !== undefined ? stored : local,
      testCaseEnv: config.testCaseEnv,
      secretEnv: config.secretEnv,
      modelId: hashed.modelId,
    };
  });
  const runs: PlannedRun[] = permutations.flatMap((permutation) =>
    Array.from({ length: config.iterations }, (_, i) => {
      const iteration = i + 1;
      const stored = imageStore === null ? undefined : storedPostrunImage(imageStore.repository, executionId, permutation.hash, iteration);
      return {
        runId: `${executionId}-${permutation.number}-${iteration}`,
        permutationHash: permutation.hash,
        iteration,
        permutation,
        container: containerName(executionId, permutation.number, iteration, imagePrefix),
        postrunImage: postrunImage(executionId, permutation.number, iteration, imagePrefix),
        ...(stored !== undefined && { storedPostrunImage: stored }),
      };
    }),
  );
  return { executionId, testCaseName: config.name, task: config.task, concurrency: settings.concurrency, config, permutations, runs };
}
