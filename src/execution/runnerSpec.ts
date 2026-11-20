/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What a host sends a runner on the runtime (see runner.ts) to have it run an execution: the
// submission. It carries the host's plan as data, since the runner can't plan again: a code state
// may resolve from the host's git checkout. A plan's functions, its harnesses' collectors, don't
// survive being sent, so the runner loads them again from its own copy of `.thunderjar/`.
import type { HarnessDeclaration, ImageStore, TestCaseDeclaration } from "../api/declarations.ts";
import { PARAMETERS } from "../config/folders.ts";
import { loadDeclaration, type Problem, problemsError } from "../config/loader.ts";
import { parsePair } from "../config/permutations.ts";
import type { ProjectConfig } from "../config/projectConfig.ts";
import { NOT_REPORTED, type PlannedExecution, type PlannedPermutation } from "./planExecution.ts";

/** A planned permutation, without its harness's functions. */
export type PermutationData = Omit<PlannedPermutation, "harness" | "collectTokenCosts">;

/** A planned execution as it's sent: what JSON can hold. */
export type PlanData = { executionId: string; permutations: PermutationData[] };

/** `plan`, without its harnesses' functions. */
export const planData = ({ executionId, permutations }: PlannedExecution): PlanData => ({
  executionId,
  permutations: permutations.map(({ harness: _harness, collectTokenCosts: _collect, ...data }) => data),
});

/**
 * `data` as a plan again: each permutation with its harness, loaded from `root`, the `.thunderjar/`
 * folder. Throws a ConfigError if a harness can't be loaded.
 */
export async function hydratePlan(root: string, data: PlanData): Promise<PlannedExecution> {
  const problems: Problem[] = [];
  const names = [...new Set(data.permutations.map(({ permutation }) => parsePair(permutation.harnessModel).harness))];
  const loaded = new Map<string, HarnessDeclaration | undefined>();
  for (const name of names) {
    loaded.set(name, (await loadDeclaration(root, `${PARAMETERS}/harnessModels/${name}/index.ts`, "declareHarness", problems)) as HarnessDeclaration | undefined);
  }
  if (problems.length > 0) throw problemsError(problems);
  return {
    executionId: data.executionId,
    permutations: data.permutations.map((permutation) => {
      const harness = loaded.get(parsePair(permutation.permutation.harnessModel).harness) as HarnessDeclaration;
      return { ...permutation, harness, collectTokenCosts: harness.collectTokenCosts ?? NOT_REPORTED };
    }),
  };
}

/** What a runner shows of the execution it runs, to whoever follows it. */
export type SubmissionSummary = {
  /** The test case's name. */
  name: string;
  testCase: TestCaseDeclaration;
  plan: PlanData;
  /** How many containers run at once. */
  concurrency: number;
};

/** An execution, as a host submits it to a runner. */
export type Submission = SubmissionSummary & {
  imagePrefix: string;
  imageStore: ImageStore;
  runDataStore: ProjectConfig["runDataStore"];
  /** The variables holding the login for the image store's registry, if the runner logs in. */
  registryLogin?: { usernameEnv: string; passwordEnv: string };
  /** The variables the runner's environment is given, with their values. Never logged, or written to disk. */
  env: Record<string, string>;
};

/** The summary of `submission`: without its variables, and what only the runner needs. */
export const summaryOf = ({ name, testCase, plan, concurrency }: Submission): SubmissionSummary => ({ name, testCase, plan, concurrency });
