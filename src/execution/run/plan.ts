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

// The planner: a resolved test case in, the Manifest out. Pure and synchronous: everything it
// needs was loaded by `resolveTestCase`, so the same config always gives the same manifest, and
// `--dry-run` can show it without touching Docker.
import { givenOverrides, hasOverrides } from "../../config/overrides.ts";
import { AXES, abbreviateHash, matrixShape } from "../../config/permutations.ts";
import { envOf, secretEnvOf } from "../../config/testCaseEnv.ts";
import { containerName, postrunImage, prerunImage, storedPostrunImage, storedPrerunImage } from "../images.ts";
import { type FolderRole, PARAMETER_DIRS } from "../prerunDockerfile.ts";
import type { Manifest, PlannedImage, PlannedPermutation, PlannedRun, ResolvedPermutation, TestCaseConfig } from "./types.ts";

/** Every permutation, run and prerun image of `config`'s execution, with at most `settings.concurrency` containers at once. */
export function plan(config: TestCaseConfig, settings: { concurrency: number }): Manifest {
  const { executionId, imagePrefix, testCase } = config;
  const repository = config.imageStore?.repository;
  const remote = config.runtime !== null;

  // One image per image hash: permutations that build the same image share the first one's.
  const images = new Map<string, PlannedImage>();
  for (const permutation of config.permutations) {
    const { imageHash, dockerfile } = permutation.hashed;
    if (images.has(imageHash)) continue;
    const image = prerunImage(imageHash, imagePrefix);
    const stored = repository === undefined ? undefined : storedPrerunImage(repository, imageHash);
    images.set(imageHash, {
      imageHash,
      image,
      ...(stored !== undefined && { stored }),
      // A remote runtime has only what it pulled from the store, under the store's name.
      runFrom: remote && stored !== undefined ? stored : image,
      dockerfile,
      context: contextOf(permutation),
    });
  }

  const permutations = config.permutations.map((permutation, index): PlannedPermutation => {
    const { hashed } = permutation;
    return {
      number: index + 1,
      hash: hashed.hash,
      imageHash: hashed.imageHash,
      prerunImage: images.get(hashed.imageHash)?.runFrom ?? prerunImage(hashed.imageHash, imagePrefix),
      parameters: AXES.map((axis) => ({
        axis,
        name: hashed[axis],
        parameterHash: hashed.parameterHashes[axis],
        ...(hashed.resolved[axis] !== undefined && { resolved: hashed.resolved[axis] }),
      })),
      harness: { ...permutation.harness },
      harnessEnv: [...permutation.harnessEnv],
      runOptions: [...permutation.runOptions],
      timeoutSeconds: permutation.timeoutSeconds,
    };
  });

  const runs = permutations.flatMap((permutation) =>
    Array.from({ length: testCase.iterations }, (_, index): PlannedRun => {
      const iteration = index + 1;
      return {
        runId: `${executionId}-${abbreviateHash(permutation.hash)}-i${iteration}`,
        permutationHash: permutation.hash,
        permutation: permutation.number,
        iteration,
        container: containerName(executionId, permutation.number, iteration, imagePrefix),
        postrunImage: postrunImage(executionId, permutation.number, iteration, imagePrefix),
        ...(repository !== undefined && { storedPostrunImage: storedPostrunImage(repository, executionId, permutation.hash, iteration) }),
      };
    }),
  );

  return {
    executionId,
    root: config.root,
    testCase: config.name,
    task: testCase.task,
    concurrency: settings.concurrency,
    buildConcurrency: config.build.concurrency,
    imagePrefix,
    imageStore: config.imageStore,
    remote,
    matrix: { shape: matrixShape(testCase), permutations: permutations.length, iterations: testCase.iterations },
    ...(hasOverrides(config.overrides) && { overrides: givenOverrides(config.overrides) }),
    env: envOf(testCase),
    secretEnv: secretEnvOf(testCase),
    build: { secrets: config.build.secrets.map((secret) => ({ ...secret })), ssh: config.build.ssh },
    hooks: {
      ...(config.runtime?.beforeExecution !== undefined && { beforeExecution: [...config.runtime.beforeExecution] }),
      ...(config.runtime?.afterExecution !== undefined && { afterExecution: [...config.runtime.afterExecution] }),
    },
    ...(config.dataDir !== undefined && { dataDir: config.dataDir }),
    timings: config.timings,
    images: [...images.values()],
    permutations,
    runs,
  };
}

/** Where each folder parameter's `files/` come from, and where in the build context they go. */
const contextOf = (permutation: ResolvedPermutation): PlannedImage["context"] =>
  (Object.keys(PARAMETER_DIRS) as FolderRole[]).map((role) => ({
    role,
    from: permutation.parameterFolders[role],
    to: PARAMETER_DIRS[role],
  }));
