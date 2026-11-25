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
import { hasOverrides } from "../../config/overrides.ts";
import { matrixShape } from "../../config/permutations.ts";
import { executionContainerPrefix } from "../../execution/images.ts";
import { moduleLogger } from "../../log/logger.ts";
import { patchRun, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { ExecutionRecord, ExecutionStatus } from "../../services/RunDataStore/RunDataStore.ts";
import { runPermutation } from "../runPermutation/runPermutation.ts";
import { createScheduler } from "../scheduler/scheduler.ts";
import type { Dependencies, Manifest, RunRecord, TestCaseConfig } from "../types.ts";
import { createUploadQueue } from "../uploadQueue/uploadQueue.ts";

const log = moduleLogger("runNext");

/**
 * Records the execution as `running`, runs each planned run, waits for the uploads, then records it
 * as `complete`, or `failed` if any run didn't complete, anything failed under one, an image
 * couldn't be uploaded, or it was asked to stop. Throws a RunDataStoreError if the execution can't be recorded.
 *
 * `config` is here for what a run needs and the manifest leaves out: its harness's functions and
 * the task's measurements.
 */
export async function runManifest(manifest: Manifest, config: TestCaseConfig, deps: Dependencies): Promise<RunRecord[]> {
  const { clock, state, runStore, runtimeDocker } = deps;
  const stopped = () => deps.signal?.aborted ?? false;
  const uploads = createUploadQueue(runtimeDocker, deps, deps.settings.uploadConcurrency);
  const scheduler = createScheduler({
    clock,
    isBackedUp: () => uploads.backlog() > deps.settings.uploadBacklogCap,
    settings: { cacheWarmupMs: deps.settings.cacheWarmupMs, backpressurePollMs: 1_000 },
    shouldStop: stopped,
  });

  /** Logs how much disk the runtime's Docker uses: only for a runtime that isn't this machine, whose disk nobody watches. */
  const logDiskUsage = async (when: "before" | "after") => {
    if (deps.hostDocker === runtimeDocker) return;
    await runtimeDocker
      .diskUsage()
      .then((usage) => log.info({ executionId: manifest.executionId, when, usage }, "runtime disk usage"))
      .catch((error: unknown) => log.debug({ err: error }, "couldn't read the runtime's disk usage"));
  };
  await logDiskUsage("before");

  const startedAt = new Date(clock.now()).toISOString();
  const executionRecord = (status: ExecutionStatus, finishedAt?: string): ExecutionRecord => ({
    executionId: manifest.executionId,
    testCase: manifest.testCaseName,
    task: manifest.task,
    startedAt,
    ...(finishedAt !== undefined && { finishedAt }),
    status,
    matrix: { shape: matrixShape(config), permutations: manifest.permutations.length, iterations: config.iterations },
    ...(hasOverrides(manifest.overrides) && { overrides: manifest.overrides }),
  });
  const record = async (execution: ExecutionRecord) => {
    await runStore.recordExecution(execution);
    state.update(updateRun((run) => ({ ...run, execution })));
  };

  state.update(updateRun((run) => manifest.runs.reduce((queued, { runId }) => patchRun(queued, runId, { status: "queued" }), run)));
  log.info({ executionId: manifest.executionId, testCase: manifest.testCaseName, runs: manifest.runs.length, concurrency: manifest.concurrency }, "execution starting");
  await record(executionRecord("running"));

  let records: RunRecord[] = [];
  let failure: unknown;
  try {
    records = await scheduler.run(manifest, (run) => runPermutation(run, { manifest, config }, deps, uploads));
    // Once asked to stop, what's still waiting to upload is left: its containers are being removed.
    if (!stopped()) await uploads.drain();
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // A container given up on before it started may have been made since, too late to be removed with its run.
    if (records.some(({ containerRun }) => containerRun?.execution.failedToStart !== undefined)) {
      await runtimeDocker
        .removeContainersNamed(executionContainerPrefix(manifest.executionId, manifest.imagePrefix))
        .then((removed) => removed.length > 0 && log.warn({ removed }, "removed containers that started too late"))
        .catch((error: unknown) => log.warn({ err: error }, "couldn't look for containers that started too late"));
    }
    await logDiskUsage("after");
    const clean =
      failure === undefined &&
      !stopped() &&
      records.length === manifest.runs.length &&
      records.every(({ outcome, error }) => outcome === "completed" && error === undefined) &&
      uploads.failures().length === 0;
    const status: ExecutionStatus = clean ? "complete" : "failed";
    await record(executionRecord(status, new Date(clock.now()).toISOString()));
    log.info({ executionId: manifest.executionId, status }, "execution finished");
  }
  return records;
}
