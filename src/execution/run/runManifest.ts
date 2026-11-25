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
import { addNote, addWarning, patchRun, type RunState, type RunStatus, recordTiming, setUploadBacklog, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { ExecutionRecord } from "../../store/runDataStore.ts";
import type { OpenStore } from "../../store/stores.ts";
import { executionContainerPrefix } from "../images.ts";
import { displayPath, notesOf } from "./render.ts";
import { ABANDONED, createRunControl, type RunControl, settled } from "./runControl.ts";
import { runPermutation } from "./runPermutation.ts";
import { createScheduler } from "./scheduler.ts";
import type { Dependencies, ExecutionResult, Manifest, RunRecord } from "./types.ts";
import { createUploadQueue, type UploadEvent } from "./uploadQueue.ts";

const log = moduleLogger("execution");

/** How long a permutation's first run has to itself, to write the prompt cache its others read. */
const CACHE_WARMUP_MS = 5_000;
/** How often a run held back by the upload backlog looks again. */
const BACKPRESSURE_POLL_MS = 1_000;

/** How often, once asked to stop, the execution's containers are removed again: one being created as they were listed is missed. */
const STOP_SWEEP_MS = 1_000;

/** Why a postrun image still waiting when the execution was asked to stop was never pushed. */
const NOT_PUSHED = "not pushed: the execution was stopped";
/** Why a run is `crashed` if it was still going when nobody waited for it any longer. */
const GIVEN_UP_ON = "It hadn't stopped when Thunderjar stopped waiting for it.";

type RunManifestDeps = Pick<Dependencies, "runtimeDocker" | "env" | "clock" | "state" | "measurer" | "stores">;

/**
 * Runs every run of `manifest`, whose prerun images are ready, and returns what was recorded.
 *
 * The execution is `failed` if any agent didn't exit 0, timed out, crashed or was cancelled, a
 * postrun image couldn't be pushed, or it was asked to stop; else `complete`. A run that fails
 * never stops the others, but a run that can't be recorded does: no other starts, since none
 * could be recorded either.
 *
 * Once `control` is asked to stop: no new run starts, and each not started is `cancelled`; the
 * execution's containers are removed, then again each second, so its agents stop; postrun images
 * still waiting are never pushed. What is still going then has STOP_SETTLE_MS to end, or until
 * forced. After that it is given up on, and the execution is recorded as `failed` all the same.
 *
 * `opened` is the run data store, if the caller has already opened and checked it. Otherwise it
 * is opened here: throws a ConfigError if it can't be, and a RunDataStoreError if it can't be
 * used, before any run starts. Throws a RunDataStoreError too if how the execution ended can't
 * be recorded.
 */
export async function runManifest(manifest: Manifest, deps: RunManifestDeps, control: RunControl = createRunControl(), opened?: OpenStore): Promise<ExecutionResult> {
  const { state, clock, runtimeDocker } = deps;
  const { executionId } = manifest;
  const update = (change: (run: RunState<Manifest>) => RunState<Manifest>) => state.update(updateRun(change));

  const { store, where } = opened ?? (await openAndCheck(manifest, deps));
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

  // A store that can't take one run can't take the next: no point running its agent.
  let storeFailed = false;
  const runStore = {
    recordContainerRun: async (record: Parameters<typeof store.recordContainerRun>[0]) => {
      try {
        await store.recordContainerRun(record);
      } catch (error) {
        storeFailed = true;
        throw error;
      }
    },
  };

  const scheduler = createScheduler({
    clock,
    // Committed images waiting to push take up the runtime's disk: new runs wait while too many are.
    isBackedUp: () => uploads.backlog() > deps.env.uploadBacklogCap,
    shouldStop: () => control.shouldStop() || storeFailed,
    settings: { cacheWarmupMs: CACHE_WARMUP_MS, backpressurePollMs: BACKPRESSURE_POLL_MS },
  });

  let warned = false;
  const removeContainers = () =>
    runtimeDocker.removeContainersNamed(executionContainerPrefix(executionId, manifest.imagePrefix)).then(
      () => {},
      (error: unknown) => {
        log.warn({ executionId, error: messageOf(error) }, "couldn't remove the execution's containers");
        // Tried again each second: said once.
        if (!warned) update((run) => addWarning(run, `Couldn't remove the execution's containers: ${messageOf(error)}`));
        warned = true;
      },
    );

  // Each run's record, as it ends: all there is to go on if the rest are given up on.
  const ended = new Map<string, RunRecord>();
  const end = (record: RunRecord) => {
    ended.set(record.runId, record);
    return record;
  };
  const work = (async () => {
    await scheduler.run(
      manifest,
      async (run) => {
        const record = end(await runPermutation(run, manifest, { ...deps, store: runStore }, uploads, control));
        showUpload(run.runId);
        return record;
      },
      (run) => {
        update((s) => patchRun(s, run.runId, { status: "cancelled" }));
        return end({ runId: run.runId, status: "cancelled" });
      },
    );
    await uploads.drain();
  })();

  // Asked to stop: the agents must stop spending, and nothing more should be pushed.
  let over = false;
  let sweep: ReturnType<typeof clock.setTimeout> | undefined;
  const sweepAgain = () => {
    if (over) return;
    void removeContainers();
    sweep = clock.setTimeout(sweepAgain, STOP_SWEEP_MS);
  };
  void control.stopped.then(() => {
    if (over) return;
    log.warn({ executionId }, "stopping the execution");
    uploads.cancel(NOT_PUSHED);
    sweepAgain();
  });

  let thrown: { error: unknown } | undefined;
  try {
    if ((await settled(work, control, clock)) === ABANDONED) log.warn({ executionId, ended: ended.size, runs: manifest.runs.length }, "gave up waiting for the execution to stop");
  } catch (error) {
    // Not expected: a run's own failures are in its record. Still recorded as failed, below.
    thrown = { error };
  } finally {
    over = true;
    clock.clearTimeout(sweep);
  }

  // Whatever hasn't ended was given up on: a run still waiting its turn never started.
  const runs = manifest.runs.map(({ runId }): RunRecord => {
    const record = ended.get(runId);
    if (record !== undefined) return record;
    const left: RunRecord = state.get().run.runs[runId]?.status === "queued" ? { runId, status: "cancelled" } : { runId, status: "crashed", error: GIVEN_UP_ON };
    update((run) => patchRun(run, runId, { status: left.status, ...(left.error !== undefined && { error: left.error }) }));
    return left;
  });

  // A container that never started may have been left created, and one started as the runs were
  // being stopped may have been missed: none of this execution's is wanted now.
  if (control.shouldStop() || runs.some(({ record }) => record?.execution.failedToStart !== undefined)) await removeContainers();
  for (const note of notesOf(manifest, runs)) update((run) => addNote(run, note));
  update((run) => ({ ...run, recordedIn: displayPath(deps.env.cwd, where) }));

  // Asked to stop is failed whatever the runs say: one may have been cut short while it was measured.
  const failed = thrown !== undefined || control.shouldStop() || runs.some(didntSucceed) || uploads.failures().length > 0;
  const execution: ExecutionRecord = { ...started, finishedAt: new Date(clock.now()).toISOString(), status: failed ? "failed" : "complete" };
  if (thrown !== undefined) {
    await store.recordExecution(execution).catch((error: unknown) => log.error({ executionId, error: messageOf(error) }, "couldn't record the execution as failed"));
    throw thrown.error;
  }
  await store.recordExecution(execution);
  log.info({ executionId, status: execution.status }, "execution finished");
  return { execution, recordedIn: where, containerRuns: await store.containerRunsOf(executionId), runs };
}

/** Opens the run data store `manifest` names, and checks it can be used: before anything starts, not as the first run is recorded. */
export async function openAndCheck(manifest: Pick<Manifest, "dataDir">, deps: Pick<Dependencies, "stores">): Promise<OpenStore> {
  const opened = await deps.stores.open(manifest.dataDir);
  await opened.store.check();
  return opened;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The statuses an upload's news may replace: the run has nothing else left to do. */
const SHOWS_UPLOAD: ReadonlySet<RunStatus | undefined> = new Set<RunStatus>(["committed", "finished", "uploading"]);

/** Whether a run makes its execution `failed`: anything but an agent that exited 0. */
const didntSucceed = ({ status, record }: RunRecord) => status !== "finished" || record?.execution.exitCode !== 0;
