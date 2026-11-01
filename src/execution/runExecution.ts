// Running one execution of a test case: its missing prerun images are built, then every
// iteration of every permutation, in plan's order, runs in a container (see containerRun.ts),
// and is recorded in the run data store as soon as it finishes, so the runs that finished
// before a crash are kept. An agent exiting non-zero is a result, not an error: it's recorded,
// and the rest still run, but the execution is `failed`.
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { AXES, matrixShape, parsePair } from "../config/permutations.ts";
import type { ContainerRunRecord, Execution, ExecutionRecord, ExecutionStatus, RunDataStore } from "../store/runDataStore.ts";
import { runInContainer } from "./containerRun.ts";
import { containerName } from "./images.ts";
import type { PlannedExecution, PlannedIteration, PlannedPermutation } from "./planExecution.ts";
import { buildPrerunImages, type PrerunBuildHooks } from "./prerunBuilds.ts";

export type RunHooks = PrerunBuildHooks & {
  /** Called as each iteration's container run starts. */
  onRunning?: (permutation: PlannedPermutation, iteration: PlannedIteration) => void;
  /** Called as each iteration's container run finishes, however its agent exited. */
  onRan?: (permutation: PlannedPermutation, iteration: PlannedIteration, execution: Execution) => void;
};

export type ExecutionToRun = {
  /** The `.thunderjar/` folder. */
  root: string;
  /** The test case's name. */
  name: string;
  testCase: TestCaseDeclaration;
  plan: PlannedExecution;
  imagePrefix?: string;
};

/** The record of `permutation`'s `iteration`, as it ran in execution `run`. */
function containerRunRecord(
  { plan, name, testCase }: ExecutionToRun,
  { number: permutationNumber, permutation }: PlannedPermutation,
  iteration: PlannedIteration,
  execution: Execution,
  harnessResult: string | null,
): ContainerRunRecord {
  const { harness, version, model } = parsePair(permutation.harnessModel);
  return {
    executionId: plan.executionId,
    testCase: name,
    task: testCase.task,
    permutation: permutationNumber,
    permutationHash: permutation.hash,
    iteration: iteration.number,
    postrunImage: iteration.postrunImage,
    ranAt: new Date(execution.startedAt).toISOString(),
    parameters: Object.fromEntries(
      AXES.map((axis) => [axis, { name: permutation[axis], parameterHash: permutation.parameterHashes[axis] }]),
    ) as ContainerRunRecord["parameters"],
    harnessModel: { harness, version, model, modelId: permutation.modelId },
    execution,
    harnessResult,
    result: {},
  };
}

/**
 * Runs `run`, recording it in `store`, and returns its execution record. Throws, before
 * anything is recorded, a DockerUnavailableError, ConfigError or DockerBuildError if its prerun
 * images can't be built. Throws a DockerContainerError if Docker fails while running one, after
 * recording the execution as `failed`.
 */
export async function runExecution(run: ExecutionToRun, store: RunDataStore, hooks: RunHooks = {}): Promise<ExecutionRecord> {
  const { root, testCase, plan, imagePrefix } = run;
  await buildPrerunImages(
    root,
    testCase.task,
    plan.permutations.map(({ permutation }) => permutation),
    imagePrefix,
    hooks,
  );

  const startedAt = new Date().toISOString();
  const executionRecord = (status: ExecutionStatus, finishedAt?: string): ExecutionRecord => ({
    executionId: plan.executionId,
    testCase: run.name,
    task: testCase.task,
    startedAt,
    finishedAt,
    status,
    matrix: { shape: matrixShape(testCase), permutations: plan.permutations.length, iterations: testCase.iterations },
  });
  await store.recordExecution(executionRecord("running"));

  let status: ExecutionStatus = "complete";
  let finished: ExecutionRecord | undefined;
  try {
    for (const permutation of plan.permutations) {
      for (const iteration of permutation.iterations) {
        hooks.onRunning?.(permutation, iteration);
        const { execution, harnessResult } = await runInContainer({
          prerunImage: permutation.prerunImage,
          postrunImage: iteration.postrunImage,
          command: iteration.command,
          container: containerName(plan.executionId, permutation.number, iteration.number, imagePrefix),
        });
        await store.recordContainerRun(containerRunRecord(run, permutation, iteration, execution, harnessResult));
        if (execution.exitCode !== 0) status = "failed";
        hooks.onRan?.(permutation, iteration, execution);
      }
    }
  } catch (error) {
    status = "failed";
    throw error;
  } finally {
    finished = executionRecord(status, new Date().toISOString());
    await store.recordExecution(finished);
  }
  return finished;
}
