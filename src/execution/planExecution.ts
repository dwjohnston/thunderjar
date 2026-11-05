// Laying out one execution of a test case: each permutation, in plan's order, with its prerun
// image, and inside it each iteration: one container run, with its postrun image, its session ID,
// and the harness command each of its turns runs. Nothing is run here.
import type {
  BaseImageDeclaration,
  HarnessDeclaration,
  InitialPromptDeclaration,
  TestCaseDeclaration,
  TokenCostCollector,
} from "../api/declarations.ts";
import { PARAMETERS } from "../config/folders.ts";
import { loadDeclaration, type Problem, problemsError } from "../config/loader.ts";
import { type HashedPermutation, parsePair } from "../config/permutations.ts";
import { type HashOptions, hashPermutations } from "./hashPermutations.ts";
import { requiredEnvOf } from "../config/requiredEnv.ts";
import { DEFAULT_IMAGE_PREFIX, postrunImage, prerunImage } from "./images.ts";

/** Where, inside the container, the harness's `cli` must leave the agent's result file. */
export const RESULT_PATH = "/thunderjar/result.json";

/** Where, inside the container, the execution wrapper writes the initial prompt, for the harness's `cli` to read. */
export const PROMPT_PATH = "/thunderjar/prompt.txt";

/**
 * Where turn `turn` (counting from 0) of an initial prompt of `count` turns reads its prompt and
 * leaves its result. A single prompt keeps PROMPT_PATH and RESULT_PATH; turns each have a folder,
 * numbered from 1.
 */
export function turnPaths(turn: number, count: number): { promptPath: string; resultPath: string } {
  if (count === 1) return { promptPath: PROMPT_PATH, resultPath: RESULT_PATH };
  return { promptPath: `/thunderjar/turns/${turn + 1}/prompt.txt`, resultPath: `/thunderjar/turns/${turn + 1}/result.json` };
}

/** The prompts of an initial prompt, one per turn. */
export const promptsOf = (initialPrompt: InitialPromptDeclaration): string[] => initialPrompt.turns ?? [initialPrompt.prompt];

/** One turn of a container run: its prompt, where it's written, and the harness command that reads it. */
export type PlannedTurn = {
  prompt: string;
  promptPath: string;
  resultPath: string;
  /** The harness's `cli` command for the turn. */
  command: string;
};

export type PlannedIteration = {
  /** Counts from 1. */
  number: number;
  postrunImage: string;
  /** A fresh UUID, the agent session its turns share. */
  sessionId: string;
  /** One, unless its initial prompt has several turns. */
  turns: PlannedTurn[];
};

export type PlannedPermutation = {
  /** Counts from 1, in plan's order. */
  number: number;
  permutation: HashedPermutation;
  prerunImage: string;
  /** The names of the environment variables its harness needs, passed into each of its containers. */
  env: string[];
  /** Its base image's `runOptions`, added to the `docker run` of each of its agent containers. */
  runOptions: string[];
  /** How long its agent may run, every turn together, from its initial prompt, before it's killed. */
  timeoutSeconds: number;
  /** Its harness's `cli` and `collectReply`. */
  harness: HarnessDeclaration;
  /** Its harness's `collectTokenCosts`, or one that reports none. */
  collectTokenCosts: TokenCostCollector;
  /** Its harness's version, and the pair's model ID, as `cli` and `collectTokenCosts` get them. */
  version: string;
  modelId: string;
  iterations: PlannedIteration[];
};

export type PlannedExecution = {
  executionId: string;
  permutations: PlannedPermutation[];
};

/** The token costs of a harness without `collectTokenCosts`. */
const NOT_REPORTED: TokenCostCollector = () => ({ outcome: "unavailable", reason: "notReported" });

/** What a permutation's harness, harness model pair and initial prompt are, loaded. */
type Loaded = {
  baseImage: BaseImageDeclaration;
  harness: HarnessDeclaration;
  collectTokenCosts: TokenCostCollector;
  version: string;
  modelId: string;
  initialPrompt: InitialPromptDeclaration;
};

/** `permutation`'s harness and initial prompt, or undefined after adding to `problems` (`loadTestCase` already checked the files). */
async function loadHarness(root: string, task: string, permutation: HashedPermutation, problems: Problem[]): Promise<Loaded | undefined> {
  const { harness: name } = parsePair(permutation.harnessModel);
  const [baseImage, harness, initialPrompt] = (await Promise.all([
    loadDeclaration(root, `${PARAMETERS}/baseImages/${permutation.baseImage}/index.ts`, "declareBaseImage", problems),
    loadDeclaration(root, `${PARAMETERS}/harnessModels/${name}/index.ts`, "declareHarness", problems),
    loadDeclaration(root, `${PARAMETERS}/tasks/${task}/initial-prompts/${permutation.initialPrompt}.ts`, "declareInitialPrompt", problems),
  ])) as [BaseImageDeclaration?, HarnessDeclaration?, InitialPromptDeclaration?];
  if (!baseImage || !harness || !initialPrompt) return undefined;
  const collectTokenCosts = harness.collectTokenCosts ?? NOT_REPORTED;
  return { baseImage, harness, collectTokenCosts, version: harness.version, modelId: permutation.modelId, initialPrompt };
}

/** Each turn of a container run in session `sessionId`, with the harness command for it, given what the harness resolved to. */
function planTurns({ harness, version, modelId, initialPrompt }: Loaded, sessionId: string, resolved: unknown): PlannedTurn[] {
  const prompts = promptsOf(initialPrompt);
  return prompts.map((prompt, turn) => {
    const paths = turnPaths(turn, prompts.length);
    const command = harness.cli({ version, modelId, initialPrompt: prompt, ...paths, turn, sessionId, resolved });
    return { prompt, ...paths, command };
  });
}

/**
 * Every container run of execution `executionId` of `testCase`, a test case of `root` (the
 * `.thunderjar/` folder) already checked by `loadTestCase`, with image names starting `imagePrefix`.
 * Each gets a fresh session ID.
 */
export async function planExecution(
  root: string,
  testCase: TestCaseDeclaration,
  executionId: string,
  imagePrefix: string = DEFAULT_IMAGE_PREFIX,
  options: HashOptions = {},
): Promise<PlannedExecution> {
  const hashed = await hashPermutations(root, testCase, options);
  const problems: Problem[] = [];
  const loaded = await Promise.all(hashed.map((permutation) => loadHarness(root, testCase.task, permutation, problems)));
  if (problems.length > 0) throw problemsError(problems);
  return {
    executionId,
    permutations: hashed.map((permutation, p) => {
      const harnessed = loaded[p] as Loaded;
      return {
        number: p + 1,
        permutation,
        prerunImage: prerunImage(permutation.imageHash, imagePrefix),
        env: requiredEnvOf(harnessed.harness),
        runOptions: harnessed.baseImage.runOptions ?? [],
        timeoutSeconds: harnessed.initialPrompt.timeoutSeconds,
        harness: harnessed.harness,
        collectTokenCosts: harnessed.collectTokenCosts,
        version: harnessed.version,
        modelId: harnessed.modelId,
        iterations: Array.from({ length: testCase.iterations }, (_, i) => {
          const sessionId = crypto.randomUUID();
          return {
            number: i + 1,
            postrunImage: postrunImage(executionId, p + 1, i + 1, imagePrefix),
            sessionId,
            turns: planTurns(harnessed, sessionId, permutation.resolved.harnessModel),
          };
        }),
      };
    }),
  };
}
