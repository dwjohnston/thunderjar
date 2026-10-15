// Laying out one test case execution — spec/080-docker-execution.md#process. Each permutation,
// in the stable listing order, gets its prerun image; inside it, each iteration is one
// container run with its postrun image and the harness command it runs
// (spec/064-harness.md#cli-running-the-agent). Nothing is run here: `run --dry-run` prints
// this, and `run` hands each container run to a ContainerRunner (src/runner.ts).

import { join } from "node:path";
import { parseHarnessModelPair } from "./config.ts";
import type {
  HarnessDeclaration,
  HarnessVersionEntry,
  InitialPromptDeclaration,
  TestCaseDeclaration,
} from "./declarations.ts";
import { resolveTestCase, type ResolvedPermutation } from "./resolve.ts";
import { postrunTag, prerunTag } from "./tags.ts";

/** Where the harness's `cli` must leave its result file — spec/087-collecting-token-costs.md#the-result-file. */
export const RESULT_PATH = "/thunderjar/result.json";

/** One iteration of one permutation. */
export interface PlannedContainerRun {
  executionId: string;
  /** Counts from 0, as in the postrun tag. */
  iterationIndex: number;
  postrunTag: string;
  /** The harness's `cli` command, rendered for this permutation with ctx.resultPath = RESULT_PATH. */
  command: string;
  /**
   * The same command for another ctx.resultPath, for a runner whose result file isn't at
   * RESULT_PATH (the host runner).
   */
  renderCommand: (resultPath: string) => string;
  /** The initial prompt's timeout, enforced by the execution wrapper. */
  timeoutSeconds: number;
}

export interface PlannedPermutation {
  permutation: ResolvedPermutation;
  prerunTag: string;
  runs: PlannedContainerRun[];
}

export interface PlannedExecution {
  executionId: string;
  iterations: number;
  permutations: PlannedPermutation[];
}

const importDefault = async <T>(path: string) => ((await import(path)) as { default: T }).default;

/**
 * The harness `cli` command for one permutation: the family's `cli`, or the selected
 * version's override, called with the resolved version, the model ID, the initial prompt and
 * the result path.
 */
async function renderCommand(root: string, task: string, permutation: ResolvedPermutation) {
  const parameters = join(root, "test-case-parameters");
  const { family, version, model } = parseHarnessModelPair(permutation.harnessModel)!; // checked by loadTestCase
  const familyDir = join(parameters, "harnessModels", family);
  const harness = await importDefault<HarnessDeclaration>(join(familyDir, "index.ts"));
  const versions = await importDefault<Record<string, HarnessVersionEntry>>(join(familyDir, "versions.ts"));
  const models = await importDefault<Record<string, string>>(join(familyDir, "models.ts"));
  const initialPrompt = await importDefault<InitialPromptDeclaration>(
    join(parameters, "tasks", task, "initial-prompts", `${permutation.initialPrompt}.ts`),
  );

  const entry = versions[version]!;
  if (!("version" in entry)) {
    throw new Error(`${permutation.harnessModel}: floating versions are not supported yet`);
  }
  const cli = entry.cli ?? harness.cli;
  const ctx = { version: entry.version, modelId: models[model]!, initialPrompt: initialPrompt.prompt };
  return {
    renderCommand: (resultPath: string) => cli({ ...ctx, resultPath }),
    timeoutSeconds: initialPrompt.timeoutSeconds,
  };
}

/**
 * Every container run of one execution of `testCase`: permutations in the stable listing
 * order, iterations inside each. `testCase` must already be checked by `loadTestCase`.
 */
export async function planExecution(
  root: string,
  testCase: TestCaseDeclaration,
  executionId: string,
): Promise<PlannedExecution> {
  const { permutations } = await resolveTestCase(root, testCase);
  const planned: PlannedPermutation[] = [];
  for (const permutation of permutations) {
    const { renderCommand: render, timeoutSeconds } = await renderCommand(root, testCase.task, permutation);
    const command = render(RESULT_PATH);
    planned.push({
      permutation,
      prerunTag: prerunTag(permutation.hash),
      runs: Array.from({ length: testCase.iterations }, (_, iterationIndex) => ({
        executionId,
        iterationIndex,
        postrunTag: postrunTag(executionId, permutation.hash, iterationIndex),
        command,
        renderCommand: render,
        timeoutSeconds,
      })),
    });
  }
  return { executionId, iterations: testCase.iterations, permutations: planned };
}
