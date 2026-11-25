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

// Everything `run` reads from the project, in one place: the project config, the test case with
// its overrides, and what each permutation's parameters declare. What comes out is plain data, so
// `plan` is pure. The loaders read the real filesystem and import the project's own files.
import type { BaseImageDeclaration, HarnessDeclaration, InitialPromptDeclaration } from "../../api/declarations.ts";
import { PARAMETERS } from "../../config/folders.ts";
import { findThunderjarRoot, loadDeclaration, type Problem, problemsError } from "../../config/loader.ts";
import { givenOverrides } from "../../config/overrides.ts";
import { type HashedPermutation, parsePair } from "../../config/permutations.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../config/projectConfig.ts";
import { checkRequiredEnv, requiredEnvOf } from "../../config/requiredEnv.ts";
import { loadTestCase } from "../../config/testCase.ts";
import { hashPermutations } from "../hashPermutations.ts";
import { DEFAULT_IMAGE_PREFIX } from "../images.ts";
import type { Dependencies, ResolvedPermutation, RunOverrides, TestCaseConfig } from "./types.ts";

/**
 * `permutation` with what its base image, harness and initial prompt declare, or undefined after
 * adding to `problems`. `loadTestCase` already checked each file, so a problem here is rare.
 */
async function resolvePermutation(
  root: string,
  task: string,
  permutation: HashedPermutation,
  variables: Record<string, string | undefined>,
  problems: Problem[],
): Promise<ResolvedPermutation | undefined> {
  const { harness: name } = parsePair(permutation.harnessModel);
  const folders = {
    baseImage: `${PARAMETERS}/baseImages/${permutation.baseImage}`,
    codeState: `${PARAMETERS}/codeStates/${permutation.codeState}`,
    promptSet: `${PARAMETERS}/promptSets/${permutation.promptSet}`,
    harness: `${PARAMETERS}/harnessModels/${name}`,
  };
  const [baseImage, harness, initialPrompt] = (await Promise.all([
    loadDeclaration(root, `${folders.baseImage}/index.ts`, "declareBaseImage", problems),
    loadDeclaration(root, `${folders.harness}/index.ts`, "declareHarness", problems),
    loadDeclaration(root, `${PARAMETERS}/tasks/${task}/initial-prompts/${permutation.initialPrompt}.ts`, "declareInitialPrompt", problems),
  ])) as [BaseImageDeclaration?, HarnessDeclaration?, InitialPromptDeclaration?];
  if (!baseImage || !harness || !initialPrompt) return undefined;
  return {
    hashed: permutation,
    harness: { name, version: harness.version, modelId: permutation.modelId },
    harnessEnv: requiredEnvOf(harness, variables),
    runOptions: baseImage.runOptions ?? [],
    timeoutSeconds: initialPrompt.timeoutSeconds,
    parameterFolders: folders,
  };
}

/**
 * Test case `name` of the project `deps.env.cwd` is in, with `overrides`, checked and loaded:
 * everything `plan` needs. Throws a ConfigError for anything wrong with the project, the test
 * case, or the variables it needs. Touches no Docker: the registry login is `ensureImages`'s.
 */
export async function resolveTestCase(name: string, overrides: RunOverrides, deps: Pick<Dependencies, "env" | "random">): Promise<TestCaseConfig> {
  const { cwd, variables } = deps.env;
  const root = await findThunderjarRoot(cwd);
  const project = await loadProjectConfig(root);
  const testCase = await loadTestCase(root, name, overrides.testCase);
  // Before anything is hashed, so a missing key is said at once.
  await checkRequiredEnv(root, testCase, variables);
  checkBuildSecrets(project.build, variables);

  const hashed = await hashPermutations(root, testCase);
  const problems: Problem[] = [];
  const permutations = await Promise.all(hashed.map((permutation) => resolvePermutation(root, testCase.task, permutation, variables, problems)));
  if (problems.length > 0) throw problemsError(problems);

  const { runtime } = project;
  return {
    root,
    name,
    testCase,
    overrides: givenOverrides(overrides.testCase),
    executionId: deps.random.ulid(),
    permutations: permutations as ResolvedPermutation[],
    imagePrefix: overrides.imagePrefix ?? DEFAULT_IMAGE_PREFIX,
    imageStore: project.imageStore,
    build: project.build,
    // Only what `run` uses of it: its runner mode is gone.
    runtime: runtime && {
      command: runtime.command,
      concurrency: runtime.concurrency,
      ...(runtime.beforeExecution && { beforeExecution: runtime.beforeExecution }),
      ...(runtime.afterExecution && { afterExecution: runtime.afterExecution }),
    },
    ...(overrides.concurrency !== undefined && { concurrency: overrides.concurrency }),
    ...(overrides.dataDir !== undefined && { dataDir: overrides.dataDir }),
    timings: overrides.timings ?? false,
    warnings: [...project.deprecations],
  };
}
