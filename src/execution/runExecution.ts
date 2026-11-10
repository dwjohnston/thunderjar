// Running one execution of a test case: its missing prerun images are built, then every
// iteration of every permutation, in plan's order, runs in a container (see containerRun.ts),
// and is recorded in the run data store as soon as it finishes, so the runs that finished
// before a crash are kept. Then the task's measurements are taken of it, each in a measurement
// container from its postrun image, and recorded with it. An agent exiting non-zero, or killed
// for running past its initial prompt's `timeoutSeconds`, is a result, not an error: it's
// recorded and measured, and the rest still run, but the execution is `failed`.
import type { BuildOptions, ImageStore, Reply, TestCaseDeclaration, TokenCosts } from "../api/declarations.ts";
import { loadMeasurements } from "../config/measurements.ts";
import { AXES, matrixShape, parsePair } from "../config/permutations.ts";
import type {
  ContainerRunRecord,
  Execution,
  ExecutionRecord,
  ExecutionStatus,
  RecordedMeasure,
  RunDataStore,
} from "../store/runDataStore.ts";
import { runInContainer } from "./containerRun.ts";
import { containerName, storedPostrunImage } from "./images.ts";
import { type PushHooks, pushPrerunImages, pushToStore } from "./imageStore.ts";
import { measureContainerRun } from "./measure.ts";
import { openMeasurementContext, recordedContext } from "./measurementContext.ts";
import { collectReply } from "./reply.ts";
import { collectTokenCosts } from "./tokenCosts.ts";
import type { PlannedExecution, PlannedIteration, PlannedPermutation } from "./planExecution.ts";
import { buildPrerunImages, type PrerunBuildHooks } from "./prerunBuilds.ts";

export type RunHooks = PrerunBuildHooks &
  PushHooks & {
  /** Called as each iteration's container run starts. */
  onRunning?: (permutation: PlannedPermutation, iteration: PlannedIteration) => void;
  /**
   * Called as each iteration's container run finishes, however its agent exited, or if it timed
   * out, with its record, before it's measured.
   */
  onRan?: (permutation: PlannedPermutation, iteration: PlannedIteration, record: ContainerRunRecord) => void;
  /** Called once each container run's measures are taken, if the task has any measurements. */
  onMeasured?: (permutation: PlannedPermutation, iteration: PlannedIteration, result: Record<string, RecordedMeasure>) => void;
};

export type ExecutionToRun = {
  /** The `.thunderjar/` folder. */
  root: string;
  /** The test case's name. */
  name: string;
  testCase: TestCaseDeclaration;
  plan: PlannedExecution;
  imagePrefix?: string;
  /** Where its images are pushed, or `null` (the default) to keep them local. Its login is checked before this runs. */
  imageStore?: ImageStore | null;
  /** The secrets and SSH agent its prerun builds are given. Their variables are checked before this runs. */
  build?: BuildOptions;
};

/** The record of `permutation`'s `iteration`, as it ran in execution `run`. */
function containerRunRecord(
  { plan, name, testCase }: ExecutionToRun,
  { number: permutationNumber, permutation, version }: PlannedPermutation,
  iteration: PlannedIteration,
  execution: Execution,
  last: { harnessResult: string | null; reply: Reply },
  tokenCosts: TokenCosts,
): ContainerRunRecord {
  const { harness } = parsePair(permutation.harnessModel);
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
      AXES.map((axis) => [
        axis,
        {
          name: permutation[axis],
          parameterHash: permutation.parameterHashes[axis],
          ...(permutation.resolved[axis] !== undefined && { resolved: permutation.resolved[axis] }),
        },
      ]),
    ) as ContainerRunRecord["parameters"],
    harnessModel: { harness, version, modelId: permutation.modelId },
    execution,
    harnessResult: last.harnessResult,
    reply: last.reply,
    tokenCosts,
    result: {},
  };
}

/**
 * Runs `run`, recording it in `store`, and returns its execution record. With an image store,
 * its prerun images are pushed once built, and each postrun image as soon as it's recorded,
 * before it's measured. Throws, before anything is recorded, a ConfigError if its task's
 * measurements are wrong, a DockerUnavailableError, ConfigError or DockerBuildError if its
 * prerun images can't be built, and a DockerPushError if one can't be pushed.
 * Throws a DockerContainerError if Docker fails while running or measuring one, after
 * recording the execution as `failed`.
 */
export async function runExecution(run: ExecutionToRun, store: RunDataStore, hooks: RunHooks = {}): Promise<ExecutionRecord> {
  const { root, testCase, plan, imagePrefix, imageStore = null, build = {} } = run;
  const measurements = await loadMeasurements(root, testCase.task);
  const permutations = plan.permutations.map(({ permutation }) => permutation);
  await buildPrerunImages(root, permutations, imagePrefix, hooks, build);
  await pushPrerunImages(permutations, imageStore, imagePrefix, hooks);

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
        const container = containerName(plan.executionId, permutation.number, iteration.number, imagePrefix);
        const { execution, harnessResult: resultFile } = await runInContainer({
          prerunImage: permutation.prerunImage,
          postrunImage: iteration.postrunImage,
          env: permutation.env,
          runOptions: permutation.runOptions,
          timeoutSeconds: permutation.timeoutSeconds,
          container,
        });
        const ran = { harnessResult: resultFile, reply: collectReply(permutation.harness.collectReply, resultFile) };
        const tokenCosts = collectTokenCosts(permutation.collectTokenCosts, [resultFile], {
          version: permutation.version,
          modelId: permutation.modelId,
        });
        const record = containerRunRecord(run, permutation, iteration, execution, ran, tokenCosts);
        const { harnessResult, reply } = record;
        await store.recordContainerRun(record);
        // Timed out, its exit code is null.
        if (execution.exitCode !== 0) status = "failed";
        hooks.onRan?.(permutation, iteration, record);
        if (imageStore !== null) {
          const reference = storedPostrunImage(imageStore.repository, plan.executionId, permutation.permutation.hash, iteration.number);
          await pushToStore(iteration.postrunImage, reference, hooks);
        }

        if (measurements.length === 0) continue;
        let opened = 0;
        const recorded = { harnessResult: harnessResult ?? "", reply: reply as Reply, replies: [reply as Reply] };
        const open = async (usesContainer: boolean) =>
          usesContainer ? openMeasurementContext(iteration.postrunImage, `${container}-measure-${++opened}`, recorded) : recordedContext(recorded);
        const result = await measureContainerRun(measurements, open);
        await store.recordContainerRun({ ...record, result });
        hooks.onMeasured?.(permutation, iteration, result);
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
