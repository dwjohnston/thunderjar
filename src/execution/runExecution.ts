// Running one execution of a test case: its missing prerun images are built, up to the build
// options' `concurrency` at once, and each pushed to the image store and pulled into the runtime,
// if there are ones, unless the image store, or the runtime, already has it. Every iteration of every permutation, in plan's order, runs in a container
// (see containerRun.ts), up to `concurrency` of them at once. With either above 1, each starts as
// soon as its own prerun image is ready, while the rest are still being built; otherwise, once
// they all are. Each is recorded in the run data store as soon as it
// finishes, so the runs that finished before a crash are kept. Then the task's measurements are taken of it, each in a measurement
// container from its postrun image, and recorded with it. An agent exiting non-zero, or killed
// for running past its initial prompt's `timeoutSeconds`, is a result, not an error: it's
// recorded and measured, and the rest still run, but the execution is `failed`. So is a container
// that never starts: it's recorded, with why, but has nothing to measure. The timeout runs from
// when the agent starts, not from `docker run`: see runContainer.
import type { BuildOptions, ImageStore, Reply, RuntimeConfig, TestCaseDeclaration, TokenCosts } from "../api/declarations.ts";
import { daemonId, diskUsage, imagesIn, inRegistry, localRuntime, remoteRuntime, removeContainersNamed, removeImages } from "../docker/docker.ts";
import type { Measurement } from "../config/measurements.ts";
import { moduleLogger } from "../log/logger.ts";
import { AXES, parsePair } from "../config/permutations.ts";
import type {
  ContainerRunRecord,
  Execution,
  ExecutionPhase,
  ExecutionRecord,
  ExecutionStatus,
  FailureStep,
  RecordedMeasure,
  RunDataStore,
} from "../store/runDataStore.ts";
import { agentOutput, head, storedStderr } from "./agentOutput.ts";
import { runInContainer } from "./containerRun.ts";
import { containerName, executionContainerPrefix, storedPostrunImage, storedPrerunImage } from "./images.ts";
import { type PullHooks, pullIntoRuntime, type PushHooks, pushToStore } from "./imageStore.ts";
import { inParallel } from "./inParallel.ts";
import { measureContainerRun } from "./measure.ts";
import { openMeasurementContext, recordedContext } from "./measurementContext.ts";
import { collectReply } from "./reply.ts";
import { type ExecutionTimings, timings } from "./timings.ts";
import { collectTokenCosts } from "./tokenCosts.ts";
import type { PlannedExecution, PlannedIteration, PlannedPermutation } from "./planExecution.ts";
import { buildPrerunImage, type PrerunBuildHooks, type PrerunImage, prerunImages } from "./prerunBuilds.ts";

const log = moduleLogger("execution");


export type RunHooks = PrerunBuildHooks &
  PushHooks &
  PullHooks & {
  /** Called as each iteration's container run starts. */
  onRunning?: (permutation: PlannedPermutation, iteration: PlannedIteration) => void;
  /**
   * Called as each iteration's container run finishes, however its agent exited, or if it timed
   * out, with its record, before it's measured.
   */
  onRan?: (permutation: PlannedPermutation, iteration: PlannedIteration, record: ContainerRunRecord) => void;
  /** Called as each container run's measures start being taken, if the task has any measurements. */
  onMeasuring?: (permutation: PlannedPermutation, iteration: PlannedIteration) => void;
  /** Called once each container run's measures are taken, if the task has any measurements. */
  onMeasured?: (permutation: PlannedPermutation, iteration: PlannedIteration, result: Record<string, RecordedMeasure>) => void;
  /** Called once each iteration has nothing left to do: run, pushed and measured. Not if it throws. */
  onDone?: (permutation: PlannedPermutation, iteration: PlannedIteration) => void;
  /** Called once, as the execution ends, however it ends, with how long each of its phases took. */
  onTimings?: (timings: ExecutionTimings) => void;
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
  /**
   * Where its containers run, or `null` (the default) for the local Docker daemon. With a
   * runtime, `imageStore` must be set: the runtime runs each prerun image from the store, and
   * pushes each postrun image there itself.
   */
  runtime?: RuntimeConfig | null;
  /** How many iterations' containers run at once: 1, one after another, by default. */
  concurrency?: number;
  /** Its task's measurements, loaded before the execution was recorded, so a broken one stops it first. */
  measurements: Measurement[];
  /** Aborted when it's interrupted: then no more builds, pushes, pulls or iterations start. */
  signal?: AbortSignal;
};

/**
 * Whether an execution runs with `concurrency` containers, and `build`'s, at once: if either is
 * above 1. Then each iteration starts as soon as its own prerun image is ready, so builds, pushes,
 * pulls and container runs happen at once, in any order.
 */
export const runsConcurrently = (concurrency = 1, build: BuildOptions = {}): boolean => concurrency > 1 || (build.concurrency ?? 1) > 1;

/**
 * Removes every container of execution `executionId`, where they run: `runtime`, or the local
 * Docker daemon for `null`. For an execution that's interrupted, so its agents stop, and none is left on
 * a runtime that's about to be stopped. Returns their names. Throws a DockerContainerError.
 */
export async function removeExecutionContainers(executionId: string, imagePrefix: string | undefined, runtime: RuntimeConfig | null): Promise<string[]> {
  const removed = await removeContainersNamed(executionContainerPrefix(executionId, imagePrefix), runtime === null ? localRuntime() : remoteRuntime(runtime.command));
  log.warn({ executionId, removed }, "execution interrupted: removed its containers");
  return removed;
}

/** An execution's record in the run data store, kept up to date as it goes. See `executionRecorder`. */
export type ExecutionRecorder = {
  /** The record as last written. */
  readonly current: ExecutionRecord;
  /** Records that it has got to `phase`, unless it's there already or has ended. */
  enter(phase: ExecutionPhase): Promise<void>;
  /** Records that it ended, `complete` or `failed`, unless it has ended already. Returns the record. */
  finish(status: Exclude<ExecutionStatus, "running">): Promise<ExecutionRecord>;
  /** Records that it failed while doing `step`, for `reason`, unless it has ended already. */
  fail(step: FailureStep, reason: string): Promise<void>;
};

/**
 * Records execution `record` in `store` as `running`, in `phase`, as it starts, before the
 * runtime's `beforeExecution` or any build, so one that fails before its first container run is
 * still recorded, with why. Writes go one after another, in order. Throws a RunDataStoreError if
 * the first can't be written; a later write that fails throws from the call that made it.
 */
export async function executionRecorder(
  store: RunDataStore,
  record: Pick<ExecutionRecord, "executionId" | "testCase" | "task" | "matrix">,
  phase: ExecutionPhase,
): Promise<ExecutionRecorder> {
  const { executionId, testCase, task, matrix } = record;
  let current: ExecutionRecord = { executionId, testCase, task, startedAt: new Date().toISOString(), status: "running", phase, matrix };
  let writing: Promise<void> = Promise.resolve();
  const write = (next: ExecutionRecord) => {
    current = next;
    // Each waits for the one before, so the last written is the last made, whether or not that one failed.
    writing = writing.catch(() => {}).then(() => store.recordExecution(next));
    return writing;
  };
  await write(current);
  const ended = () => current.status !== "running";
  return {
    get current() {
      return current;
    },
    async enter(next) {
      if (ended() || current.phase === next) return;
      await write({ ...current, phase: next });
    },
    async finish(status) {
      if (!ended()) await write({ ...current, status, finishedAt: new Date().toISOString() });
      return current;
    },
    async fail(step, reason) {
      if (ended()) return;
      log.error({ executionId: current.executionId, phase: current.phase, step, reason }, "execution failed");
      await write({ ...current, status: "failed", finishedAt: new Date().toISOString(), failure: { step, reason } });
    },
  };
}

/** What a container run left, as recorded: its result file, the end of its stderr, and its reply. */
type RecordedTurn = { harnessResult: string | null; harnessStderr: string | null; reply: Reply };

/** The record of `permutation`'s `iteration`, as it ran in execution `run`. */
function containerRunRecord(
  { plan, name, testCase }: ExecutionToRun,
  { number: permutationNumber, permutation, version }: PlannedPermutation,
  iteration: PlannedIteration,
  execution: Execution,
  last: RecordedTurn,
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
    harnessStderr: last.harnessStderr,
    reply: last.reply,
    tokenCosts,
    result: {},
  };
}

/**
 * Runs `run`, recording its container runs in `store`, and its progress and end through
 * `recorder`, and returns its execution record. With an image store,
 * each prerun image is pushed once built, and each postrun image as soon as it's recorded,
 * while it's measured, then removed from the runtime. Throws a
 * DockerUnavailableError, ConfigError or DockerBuildError if a prerun image can't be built, a
 * DockerPushError if one can't be pushed, a DockerPullError if the runtime can't pull one, and a
 * DockerContainerError if Docker fails while running or measuring one. Once anything fails, no
 * more builds or iterations start, and those going finish first. If it throws, the execution is
 * left `running`, for the caller to record as failed, with the error as it reports it.
 */
export async function runExecution(run: ExecutionToRun, store: RunDataStore, recorder: ExecutionRecorder, hooks: RunHooks = {}): Promise<ExecutionRecord> {
  const { root, testCase, plan, imagePrefix, imageStore = null, build = {}, runtime: remote = null, measurements } = run;
  if (remote !== null && imageStore === null) throw new Error("A runtime needs an image store: it runs images from it.");
  const runtime = remote === null ? localRuntime() : remoteRuntime(remote.command);
  const { executionId } = plan;
  const timer = timings();
  const executionStartedAt = Date.now();
  log.info(
    { executionId, testCase: run.name, task: testCase.task, permutations: plan.permutations.length, imageStore: imageStore?.repository, runtime: remote?.command, concurrency: run.concurrency ?? 1 },
    "execution starting",
  );
  /** Logs how much disk the runtime's Docker uses, `when` the execution starts or ends. Only for a remote runtime, whose disk nobody watches. */
  const logDiskUsage = async (when: "before" | "after") => {
    if (remote === null) return;
    try {
      log.info({ executionId, when, usage: await diskUsage(runtime) }, "runtime disk usage");
    } catch (error) {
      log.debug({ executionId, error: error instanceof Error ? error.message : String(error) }, "couldn't read the runtime's disk usage");
    }
  };
  await logDiskUsage("before");
  await recorder.enter("images");
  // The stored prerun images a remote runtime already has, listed with one command, so they aren't
  // pulled again. None if it can't be asked: then each is pulled.
  const onRuntime =
    remote === null || imageStore === null
      ? Promise.resolve(new Set<string>())
      : imagesIn(imageStore.repository, runtime).catch((error: unknown) => {
          log.info({ error: error instanceof Error ? error.message : String(error) }, "couldn't list the runtime's images: each prerun image is pulled");
          return new Set<string>();
        });
  // Whether each stored prerun image is in the image store, asked once per execution.
  const storeAnswers = new Map<string, Promise<boolean>>();
  const inStore = (reference: string): Promise<boolean> => {
    const answer = storeAnswers.get(reference) ?? inRegistry(reference);
    storeAnswers.set(reference, answer);
    return answer;
  };
  // Whether prerun images are built on the runtime's own daemon, as when THUNDERJAR_DOCKER points at
  // it. Asked only once one is pushed, and false if either daemon can't say.
  let sameDaemon: Promise<boolean> | undefined;
  const buildsOnRuntime = () =>
    (sameDaemon ??= Promise.all([daemonId(localRuntime()), daemonId(runtime)]).then(([local, other]) => local !== undefined && local === other));
  const images = await prerunImages(
    plan.permutations.map(({ permutation }) => permutation),
    imagePrefix,
  );
  // Asked of the registry for every image at once, rather than as each one's turn to build comes.
  if (imageStore !== null) for (const { permutation } of images) void inStore(storedPrerunImage(imageStore.repository, permutation.imageHash));
  // A remote runtime runs each prerun image as the image store has it, by its stored reference.
  const prerunImageOf = (permutation: PlannedPermutation) =>
    remote === null ? permutation.prerunImage : storedPrerunImage((imageStore as ImageStore).repository, permutation.permutation.imageHash);

  // The first thing to fail, after which nothing more starts.
  let failure: { error: unknown } | undefined;
  const failing = async (job: () => Promise<void>) => {
    try {
      await job();
    } catch (error) {
      failure ??= { error };
      throw error;
    }
  };

  // Each prerun image, by its hash, once it's built, pushed to the image store and pulled into the runtime.
  const ready = new Map(images.map(({ permutation }) => [permutation.imageHash, Promise.withResolvers<void>()]));
  // Awaited only by the iterations that need it, so one that fails with none waiting isn't unhandled.
  for (const { promise } of ready.values()) promise.catch(() => {});
  const prepare = async ({ exists, ...image }: PrerunImage & { exists: boolean }) => {
    const reference = imageStore === null ? undefined : storedPrerunImage(imageStore.repository, image.permutation.imageHash);
    if (reference === undefined) {
      if (!exists) await timer.time("build", () => buildPrerunImage(root, image, hooks, build));
      ready.get(image.permutation.imageHash)?.resolve();
      return;
    }
    // Its tag is its content's hash, so if the image store has it, from an earlier execution on this
    // machine or another, it isn't pushed again. Nor built, for a remote runtime: it needs it only there.
    const stored = await inStore(reference);
    if (stored && remote !== null) {
      log.info({ image: image.image, reference }, "prerun image already in the image store: not built or pushed");
    } else {
      if (!exists) await timer.time("build", () => buildPrerunImage(root, image, hooks, build));
      if (stored) log.info({ image: image.image, reference }, "prerun image already in the image store: not pushed");
      else await timer.time("pushPrerun", () => pushToStore(image.image, reference, hooks));
    }
    if (remote !== null) {
      if ((await onRuntime).has(reference)) {
        log.info({ reference }, "prerun image already in the runtime: not pulled");
      } else if (!stored && (await buildsOnRuntime())) {
        // Pushing it tagged it as `reference` on the daemon it was built on, which is the runtime's.
        log.info({ reference }, "prerun image built and pushed on the runtime's own daemon: not pulled");
      } else {
        // So a runtime that can't reach the image store, or has no login for it, fails before its agent runs.
        await timer.time("pullPrerun", () => pullIntoRuntime([reference], runtime, hooks));
      }
    }
    ready.get(image.permutation.imageHash)?.resolve();
  };
  const preparing = inParallel(
    images.map(
      (image) => () =>
        failure === undefined
          ? failing(async () => {
              run.signal?.throwIfAborted();
              await prepare(image);
            })
          : Promise.resolve(),
    ),
    build.concurrency ?? 1,
  )
    .catch(() => {})
    // Those not ready never will be: the iterations waiting for them fail, with what failed first.
    .finally(() => {
      for (const { reject } of ready.values()) reject(failure?.error);
    });
  if (!runsConcurrently(run.concurrency, build)) {
    await preparing;
    if (failure !== undefined) throw failure.error;
  }

  let status: ExecutionStatus = "complete";
  // Whether a container was given up on before it started: the runtime may yet make it.
  let notStarted = false;
  let finished: ExecutionRecord | undefined;
  const runIteration = async (permutation: PlannedPermutation, iteration: PlannedIteration) => {
    await ready.get(permutation.permutation.imageHash)?.promise;
    if (failure !== undefined) throw failure.error;
    run.signal?.throwIfAborted();
    await recorder.enter("runs");
    await runAndMeasure(permutation, iteration);
    hooks.onDone?.(permutation, iteration);
  };
  const runAndMeasure = async (permutation: PlannedPermutation, iteration: PlannedIteration) => {
    hooks.onRunning?.(permutation, iteration);
    const at = { executionId, permutation: permutation.number, iteration: iteration.number };
    log.info({ ...at, permutationHash: permutation.permutation.hash }, "container run starting");
    const container = containerName(plan.executionId, permutation.number, iteration.number, imagePrefix);
    const { execution, harnessResult: resultFile, stderr, committed } = await runInContainer({
      prerunImage: prerunImageOf(permutation),
      postrunImage: iteration.postrunImage,
      env: permutation.env,
      runOptions: permutation.runOptions,
      timeoutSeconds: permutation.timeoutSeconds,
      container,
      runtime,
      time: timer.time,
    });
    const ran = { harnessResult: resultFile, harnessStderr: storedStderr(stderr), reply: collectReply(permutation.harness.collectReply, resultFile) };
    const tokenCosts = collectTokenCosts(permutation.collectTokenCosts, [resultFile], {
      version: permutation.version,
      modelId: permutation.modelId,
    });
    const record = containerRunRecord(run, permutation, iteration, execution, ran, tokenCosts);
    const { harnessResult, reply } = record;
    await store.recordContainerRun(record);
    // Timed out, its exit code is null.
    if (execution.exitCode !== 0) status = "failed";
    log.info({ ...at, exitCode: execution.exitCode, timedOut: execution.timedOut, tokenCosts }, "container run finished");
    // What the agent said, so the log says why it failed: its stderr is otherwise lost (#140).
    const output = agentOutput([resultFile], [stderr]);
    if (execution.timedOut) log.warn({ ...at, timeoutSeconds: execution.timeoutSeconds, output }, "agent timed out");
    else if (execution.exitCode !== 0) log.warn({ ...at, exitCode: execution.exitCode, output }, "agent exited non-zero");
    else if (output.some((turn) => turn.stderr !== undefined)) log.debug({ ...at, output }, "agent output");
    if (tokenCosts.outcome === "unavailable" && tokenCosts.reason === "unparseable") {
      log.warn({ ...at, result: resultFile && head(resultFile, 500) }, "token costs unparseable from the result file");
    }
    hooks.onRan?.(permutation, iteration, record);
    // Its container never started: it has no postrun image to push or measure.
    if (!committed) {
      log.warn({ ...at, reason: execution.failedToStart }, "container didn't start");
      notStarted = true;
      return;
    }
    // Committed in the runtime, so pushed from there. When iterations run at once, it's pushed while
    // it's measured, as both only read the postrun image; one at a time, before, so each step's
    // line is shown in turn.
    const stored = imageStore === null ? undefined : storedPostrunImage(imageStore.repository, plan.executionId, permutation.permutation.hash, iteration.number);
    const pushing = stored === undefined ? undefined : timer.time("pushPostrun", () => pushToStore(iteration.postrunImage, stored, hooks, runtime));
    // Awaited below, so a failed push isn't unhandled while the measurements are taken.
    pushing?.catch(() => {});
    if (!runsConcurrently(run.concurrency, build)) await pushing;

    if (measurements.length > 0) {
      hooks.onMeasuring?.(permutation, iteration);
      let opened = 0;
      const recorded = { harnessResult: harnessResult ?? "", reply: reply as Reply, replies: [reply as Reply] };
      const open = async (usesContainer: boolean) =>
        usesContainer ? openMeasurementContext(iteration.postrunImage, `${container}-measure-${++opened}`, recorded, runtime) : recordedContext(recorded);
      log.debug({ ...at, measurements: measurements.length }, "measuring");
      const measuringAt = Date.now();
      // One measurement container for all of them: on a remote runtime, each takes seconds to start.
      const result = await timer.time("measure", () => measureContainerRun(measurements, open));
      log.info({ ...at, ms: Date.now() - measuringAt, containers: opened, result }, "measured");
      await store.recordContainerRun({ ...record, result });
      hooks.onMeasured?.(permutation, iteration, result);
    }
    await pushing;

    // Once it's in the image store and measured, the runtime needn't keep it: each one left there
    // fills its disk. Pulled from the store again if it's ever wanted. Kept with a runtime's keepPostrunImages.
    if (stored !== undefined && !remote?.keepPostrunImages) {
      await timer
        .time("cleanup", () => removeImages([iteration.postrunImage, stored], runtime))
        .catch((error: unknown) => log.warn({ ...at, err: error }, "couldn't remove the postrun image from the runtime"));
    }
  };

  let threw = false;
  try {
    await inParallel(
      plan.permutations.flatMap((permutation) => permutation.iterations.map((iteration) => () => failing(() => runIteration(permutation, iteration)))),
      run.concurrency ?? 1,
    );
  } catch (error) {
    threw = true;
    log.error({ executionId, err: error }, "execution stopped on an error");
    throw error;
  } finally {
    // Nothing is left building, pushing or pulling.
    await preparing;
    // A container given up on before it started may have been made since, too late to be removed with its run.
    if (notStarted) {
      await removeContainersNamed(executionContainerPrefix(executionId, imagePrefix), runtime)
        .then((removed) => removed.length > 0 && log.warn({ executionId, removed }, "removed containers that started too late"))
        .catch((error: unknown) => log.warn({ executionId, err: error }, "couldn't look for containers that started too late"));
    }
    await logDiskUsage("after");
    const spent = timer.summary();
    log.info({ executionId, ...spent }, "execution timings");
    hooks.onTimings?.(spent);
    if (!threw) {
      finished = await recorder.finish(status);
      log.info({ executionId, status, ms: Date.now() - executionStartedAt }, "execution finished");
    }
  }
  return finished as ExecutionRecord;
}
