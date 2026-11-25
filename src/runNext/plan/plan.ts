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
import { givenOverrides } from "../../config/overrides.ts";
import { abbreviateHash, AXES } from "../../config/permutations.ts";
import { containerName, postrunImage, storedPostrunImage, storedPrerunImage } from "../../execution/images.ts";
import type { Manifest, PlannedPermutation, PlannedRun, TestCaseConfig } from "../types.ts";

/** `<execution id>-<abbreviated permutation hash>-i<iteration>`: the iteration counts from 1. */
export const runIdOf = (executionId: string, permutationHash: string, iteration: number) => `${executionId}-${abbreviateHash(permutationHash)}-i${iteration}`;

/**
 * The execution ID is passed in rather than made here, so `plan` stays pure. Runs are in plan's
 * order: each permutation's iterations together.
 */
export function plan(config: TestCaseConfig, settings: { concurrency: number; executionId: string }): Manifest {
  const { executionId, concurrency } = settings;
  const repository = config.imageStore?.repository;
  const permutations: PlannedPermutation[] = config.permutations.map((resolved) => {
    const { permutation: hashed } = resolved;
    return {
      number: resolved.number,
      hash: hashed.hash,
      imageHash: hashed.imageHash,
      parameters: AXES.map((layer) => ({ layer, value: hashed[layer], hash: hashed.parameterHashes[layer] })),
      modelId: resolved.modelId,
      harnessVersion: resolved.version,
      prerunImage: resolved.prerunImage,
      ...(repository !== undefined && { storedPrerunImage: storedPrerunImage(repository, hashed.imageHash) }),
      env: resolved.env,
      testCaseEnv: resolved.testCaseEnv,
      secretEnv: resolved.secretEnv,
      runOptions: resolved.runOptions,
      timeoutSeconds: resolved.timeoutSeconds,
    };
  });
  const runs: PlannedRun[] = permutations.flatMap((permutation) =>
    Array.from({ length: config.iterations }, (_, i) => ({
      runId: runIdOf(executionId, permutation.hash, i + 1),
      permutationHash: permutation.hash,
      permutation: permutation.number,
      iteration: i + 1,
      container: containerName(executionId, permutation.number, i + 1, config.imagePrefix),
      postrunImage: postrunImage(executionId, permutation.number, i + 1, config.imagePrefix),
      ...(repository !== undefined && { storedPostrunImage: storedPostrunImage(repository, executionId, permutation.hash, i + 1) }),
    })),
  );
  return {
    executionId,
    testCaseName: config.name,
    task: config.task,
    concurrency,
    buildConcurrency: config.build.concurrency,
    imagePrefix: config.imagePrefix,
    imageStore: repository ?? null,
    overrides: givenOverrides(config.overrides),
    permutations,
    runs,
  };
}

/** The image a permutation's containers start from: where it's stored, with an image store. */
export const runsFrom = (permutation: PlannedPermutation): string => permutation.storedPrerunImage ?? permutation.prerunImage;
