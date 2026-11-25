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

// Level 3: run every planned run, up to the concurrency, then wait for the uploads.
import { givenOverrides, hasOverrides } from "../../config/overrides.ts";
import { matrixShape } from "../../config/permutations.ts";
import { executionContainerPrefix } from "../../execution/images.ts";
import { moduleLogger } from "../../log/logger.ts";
import { setUploadBacklog, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { ExecutionRecord, ExecutionStatus } from "../../services/RunDataStore/RunDataStore.ts";
import { runPermutation } from "../runPermutation/runPermutation.ts";
import { createScheduler } from "../scheduler/scheduler.ts";
import { changeRunDetails, detailsOf, logEvent, setRun, timed } from "../state/state.ts";
import type { Dependencies, Manifest, RunRecord } from "../types.ts";
import { createUploadQueue } from "../uploadQueue/uploadQueue.ts";

const log = moduleLogger("execution");

/**
 * Records the execution as running, runs its runs, waits for their post-run images to upload, then
 * records it as complete, or failed if any agent didn't exit 0, any run crashed or timed out, or it
 * was asked to stop. Throws, once the execution is recorded as failed, a DockerPushError if a
 * post-run image couldn't be pushed, or a RunDataStoreError.
 */
export async function runManifest(manifest: Manifest, deps: Dependencies): Promise<RunRecord[]> {
  const { config, executionId } = manifest;
  const startedAt = new Date(deps.clock.now()).toISOString();
  const executionRecord = (status: ExecutionStatus, finishedAt?: string): ExecutionRecord => ({
    executionId,
    testCase: manifest.testCaseName,
    task: manifest.task,
    startedAt,
    finishedAt,
    status,
    matrix: { shape: matrixShape(config), permutations: manifest.permutations.length, iterations: config.iterations },
    ...(hasOverrides(config.overrides) && { overrides: givenOverrides(config.overrides) }),
  });
  log.info({ executionId, testCase: manifest.testCaseName, runs: manifest.runs.length, concurrency: manifest.concurrency }, "execution starting");
  for (const { runId } of manifest.runs) setRun(deps, runId, "queued");
  await deps.runStore.recordExecution(executionRecord("running"));

  // Each push is timed from when it starts, not from when it's queued.
  const pushing = new Map<string, PromiseWithResolvers<void>>();
  const uploads = createUploadQueue(deps.runtimeDocker, {
    concurrency: deps.settings.uploadConcurrency,
    onChange: ({ image, step, backlog }) => {
      deps.state.update(updateRun((run) => setUploadBacklog(run, backlog)));
      if (step === "queued") return;
      if (step === "uploading") {
        const pushed = Promise.withResolvers<void>();
        pushing.set(image.runId, pushed);
        void timed(deps, "pushPostrun", () => pushed.promise).catch(() => {});
        setRun(deps, image.runId, "uploading");
      } else {
        if (step === "uploaded") pushing.get(image.runId)?.resolve();
        else pushing.get(image.runId)?.reject(new Error("push failed"));
        // A run that failed to upload stays committed: its image is still in the runtime.
        setRun(deps, image.runId, step === "uploaded" ? "uploaded" : "committed");
      }
      logEvent(deps, { type: "run", runId: image.runId, reference: image.reference, step: step === "failed" ? "uploadFailed" : step });
    },
  });
  const scheduler = createScheduler({
    clock: deps.clock,
    isBackedUp: () => uploads.backlog() > deps.settings.uploadBacklogCap,
    isStopped: () => deps.state.get().run.details?.stopRequested !== undefined,
    settings: { cacheWarmupMs: deps.settings.cacheWarmupMs, backpressurePollMs: 1_000 },
  });

  let records: RunRecord[] = [];
  let failure: { error: unknown } | undefined;
  try {
    records = await scheduler.run(manifest, (run) => runPermutation(run, deps, uploads));
  } catch (error) {
    failure = { error };
  }
  try {
    await uploads.drain();
  } catch (error) {
    failure ??= { error };
  }
  // A container given up on before it started may have been made since, too late to be removed with its run.
  if (records.some((record) => record.outcome === "crashed")) {
    await deps.runtimeDocker
      .removeContainersNamed(executionContainerPrefix(executionId, config.imagePrefix))
      .then((removed) => removed.length > 0 && log.warn({ executionId, removed }, "removed containers left behind"))
      .catch((error: unknown) => log.warn({ executionId, err: error }, "couldn't look for containers left behind"));
  }

  const stopped = deps.state.get().run.details?.stopRequested !== undefined;
  const failed = failure !== undefined || stopped || records.length < manifest.runs.length || records.some((record) => record.exitCode !== 0);
  const execution = executionRecord(failed ? "failed" : "complete", new Date(deps.clock.now()).toISOString());
  await deps.runStore.recordExecution(execution);
  log.info({ executionId, status: execution.status }, "execution finished");
  if (failure !== undefined) throw failure.error;

  const [recordedIn, containerRuns] = await Promise.all([deps.settings.runStoreLocation(), deps.runStore.containerRunsOf(executionId)]);
  changeRunDetails(deps, (details) => ({
    ...details,
    finished: { execution, recordedIn, containerRuns, timings: { wallMs: deps.clock.now() - detailsOf(deps.state.get().run).startedAt, phases: details.phases } },
  }));
  return records;
}
