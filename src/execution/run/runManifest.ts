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

// Level 3: a manifest's runs, start to finish. Opens the run data store and records the execution
// as running; hands each run to the scheduler, up to the manifest's concurrency at once; lets the
// upload queue push each committed postrun image behind them; then records how the execution
// ended. It only writes to the state: nothing is printed here.
import { moduleLogger } from "../../log/logger.ts";
import { addNote, patchRun, type RunState, type RunStatus, recordTiming, setUploadBacklog, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { ExecutionRecord } from "../../store/runDataStore.ts";
import { executionContainerPrefix } from "../images.ts";
import { displayPath, notesOf } from "./render.ts";
import { runPermutation } from "./runPermutation.ts";
import { createScheduler } from "./scheduler.ts";
import type { Dependencies, ExecutionResult, Manifest, RunRecord } from "./types.ts";
import { createUploadQueue, type UploadEvent } from "./uploadQueue.ts";

const log = moduleLogger("execution");

/** How long a permutation's first run has to itself, to write the prompt cache its others read. */
const CACHE_WARMUP_MS = 5_000;
/** How often a run held back by the upload backlog looks again. */
const BACKPRESSURE_POLL_MS = 1_000;

/** How whoever started the runs asks for them to stop. */
export type RunControl = {
  /** Once true, no new run starts: each one not yet started ends as `cancelled`. */
  shouldStop?: () => boolean;
};

type RunManifestDeps = Pick<Dependencies, "runtimeDocker" | "env" | "clock" | "state" | "measurer" | "stores">;

/**
 * Runs every run of `manifest`, whose prerun images are ready, and returns what was recorded.
 *
 * The execution is `failed` if any agent didn't exit 0, timed out, crashed or was cancelled, or a
 * postrun image couldn't be pushed; else `complete`. A run that fails never stops the others.
 *
 * Throws a ConfigError if the run data store can't be opened, and a RunDataStoreError if it can't
 * be used: found before any run starts.
 */
export async function runManifest(manifest: Manifest, deps: RunManifestDeps, control: RunControl = {}): Promise<ExecutionResult> {
  const { state, clock, runtimeDocker } = deps;
  const { executionId } = manifest;
  const update = (change: (run: RunState<Manifest>) => RunState<Manifest>) => state.update(updateRun(change));

  const { store, where } = await deps.stores.open(manifest.dataDir);
  // Before anything starts: otherwise it's found out as the first run is recorded.
  await store.check();
  const started: ExecutionRecord = {
    executionId,
    testCase: manifest.testCase,
    task: manifest.task,
    startedAt: new Date(clock.now()).toISOString(),
    status: "running",
    matrix: manifest.matrix,
    ...(manifest.overrides !== undefined && { overrides: manifest.overrides }),
  };
  await store.recordExecution(started);
  log.info({ executionId, runs: manifest.runs.length, concurrency: manifest.concurrency }, "execution started");
  for (const { runId } of manifest.runs) update((run) => patchRun(run, runId, { status: "queued" }));

  // Where each run's upload has got to, and when it began. A run still being measured shows that:
  // its upload is shown once it has finished.
  const uploaded = new Map<string, { status: "uploading" | "uploaded"; since: number }>();
  const showUpload = (runId: string) => {
    const upload = uploaded.get(runId);
    const shown = state.get().run.runs[runId]?.status;
    if (upload === undefined || !SHOWS_UPLOAD.has(shown)) return;
    update((run) => patchRun(run, runId, { status: upload.status }));
  };
  const onUpload = ({ image, status, error }: UploadEvent) => {
    update((run) => setUploadBacklog(run, uploads.backlog()));
    if (status === "uploading" || status === "uploaded") {
      const since = uploaded.get(image.runId)?.since ?? clock.now();
      if (status === "uploaded") update((run) => recordTiming(run, "pushPostrun", clock.now() - since));
      uploaded.set(image.runId, { status, since });
      showUpload(image.runId);
    }
    if (status === "failed") {
      uploaded.delete(image.runId);
      // Its run is done all the same: the execution is what's marked failed.
      if (state.get().run.runs[image.runId]?.status === "uploading") update((run) => patchRun(run, image.runId, { status: "finished" }));
      update((run) => addNote(run, `Pushing ${image.reference} failed: ${error ?? "unknown error"}`));
    }
  };
  const uploads = createUploadQueue({ docker: runtimeDocker, onChange: onUpload });

  const scheduler = createScheduler({
    clock,
    // Committed images waiting to push take up the runtime's disk: new runs wait while too many are.
    isBackedUp: () => uploads.backlog() > deps.env.uploadBacklogCap,
    ...(control.shouldStop !== undefined && { shouldStop: control.shouldStop }),
    settings: { cacheWarmupMs: CACHE_WARMUP_MS, backpressurePollMs: BACKPRESSURE_POLL_MS },
  });

  let runs: RunRecord[] = [];
  let thrown: { error: unknown } | undefined;
  try {
    runs = await scheduler.run(
      manifest,
      async (run) => {
        const record = await runPermutation(run, manifest, { ...deps, store }, uploads);
        showUpload(run.runId);
        return record;
      },
      (run): RunRecord => {
        update((s) => patchRun(s, run.runId, { status: "cancelled" }));
        return { runId: run.runId, status: "cancelled" };
      },
    );
    await uploads.drain();
  } catch (error) {
    // Not expected: a run's own failures are in its record. Still recorded as failed, below.
    thrown = { error };
  }

  // A container that never started may have been left created, and one started as the runs were
  // being stopped may have been missed: none of this execution's is wanted now.
  if (control.shouldStop?.() === true || runs.some(({ record }) => record?.execution.failedToStart !== undefined)) {
    await runtimeDocker.removeContainersNamed(executionContainerPrefix(executionId, manifest.imagePrefix)).catch((error: unknown) => {
      log.warn({ executionId, error: messageOf(error) }, "couldn't remove the execution's containers");
    });
  }
  for (const note of notesOf(manifest, runs)) update((run) => addNote(run, note));
  update((run) => ({ ...run, recordedIn: displayPath(deps.env.cwd, where) }));

  const failed = thrown !== undefined || runs.some(didntSucceed) || uploads.failures().length > 0;
  const execution: ExecutionRecord = { ...started, finishedAt: new Date(clock.now()).toISOString(), status: failed ? "failed" : "complete" };
  if (thrown !== undefined) {
    await store.recordExecution(execution).catch((error: unknown) => log.error({ executionId, error: messageOf(error) }, "couldn't record the execution as failed"));
    throw thrown.error;
  }
  await store.recordExecution(execution);
  log.info({ executionId, status: execution.status }, "execution finished");
  return { execution, recordedIn: where, containerRuns: await store.containerRunsOf(executionId), runs };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The statuses an upload's news may replace: the run has nothing else left to do. */
const SHOWS_UPLOAD: ReadonlySet<RunStatus | undefined> = new Set<RunStatus>(["committed", "finished", "uploading"]);

/** Whether a run makes its execution `failed`: anything but an agent that exited 0. */
const didntSucceed = ({ status, record }: RunRecord) => status !== "finished" || record?.execution.exitCode !== 0;
