// Laying out one execution of a test case: each permutation, in plan's order, with its prerun
// image, and inside it each iteration: one container run, with its postrun image and the harness
// command it runs. Nothing is run here.
import type {
  HarnessDeclaration,
  HarnessModelsDeclaration,
  HarnessVersionsDeclaration,
  InitialPromptDeclaration,
  TestCaseDeclaration,
} from "../api/declarations.ts";
import { PARAMETERS } from "../config/folders.ts";
import { loadDeclaration, type Problem, problemsError } from "../config/loader.ts";
import { type HashedPermutation, hashPermutations, parsePair } from "../config/permutations.ts";
import { DEFAULT_IMAGE_PREFIX, postrunImage, prerunImage } from "./images.ts";

/** Where, inside the container, the harness's `cli` must leave the agent's result file. */
export const RESULT_PATH = "/thunderjar/result.json";

export type PlannedIteration = {
  /** Counts from 1. */
  number: number;
  postrunImage: string;
  /** The harness's `cli` command for the permutation. */
  command: string;
};

export type PlannedPermutation = {
  /** Counts from 1, in plan's order. */
  number: number;
  permutation: HashedPermutation;
  prerunImage: string;
  iterations: PlannedIteration[];
};

export type PlannedExecution = {
  executionId: string;
  permutations: PlannedPermutation[];
};

/** The harness `cli` command `permutation` runs, or undefined after adding to `problems` (`loadTestCase` already checked the files). */
async function harnessCommand(
  root: string,
  task: string,
  permutation: HashedPermutation,
  problems: Problem[],
): Promise<string | undefined> {
  const { harness: name, version, model } = parsePair(permutation.harnessModel);
  const dir = `${PARAMETERS}/harnessModels/${name}`;
  const [harness, versions, models, initialPrompt] = (await Promise.all([
    loadDeclaration(root, `${dir}/index.ts`, "declareHarness", problems),
    loadDeclaration(root, `${dir}/versions.ts`, "declareHarnessVersions", problems),
    loadDeclaration(root, `${dir}/models.ts`, "declareHarnessModels", problems),
    loadDeclaration(root, `${PARAMETERS}/tasks/${task}/initial-prompts/${permutation.initialPrompt}.ts`, "declareInitialPrompt", problems),
  ])) as [HarnessDeclaration?, HarnessVersionsDeclaration?, HarnessModelsDeclaration?, InitialPromptDeclaration?];
  if (!harness || !versions || !models || !initialPrompt) return undefined;
  return harness.cli({
    version: (versions[version] as { version: string }).version,
    modelId: models[model] as string,
    initialPrompt: initialPrompt.prompt,
    resultPath: RESULT_PATH,
  });
}

/**
 * Every container run of execution `executionId` of `testCase`, a test case of `root` (the
 * `.thunderjar/` folder) already checked by `loadTestCase`, with image names starting `imagePrefix`.
 */
export async function planExecution(
  root: string,
  testCase: TestCaseDeclaration,
  executionId: string,
  imagePrefix: string = DEFAULT_IMAGE_PREFIX,
): Promise<PlannedExecution> {
  const hashed = await hashPermutations(root, testCase);
  const problems: Problem[] = [];
  const commands = await Promise.all(hashed.map((permutation) => harnessCommand(root, testCase.task, permutation, problems)));
  if (problems.length > 0) throw problemsError(problems);
  return {
    executionId,
    permutations: hashed.map((permutation, p) => ({
      number: p + 1,
      permutation,
      prerunImage: prerunImage(permutation.hash, imagePrefix),
      iterations: Array.from({ length: testCase.iterations }, (_, i) => ({
        number: i + 1,
        postrunImage: postrunImage(executionId, p + 1, i + 1, imagePrefix),
        command: commands[p] as string,
      })),
    })),
  };
}
