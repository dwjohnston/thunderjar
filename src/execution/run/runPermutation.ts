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

// One run, start to finish: its prerun image's run script, timed, in a container on the runtime;
// the container committed into its postrun image, even after a non-zero exit or a timeout; that
// image searched for secrets, recorded, handed to the upload queue and measured. The container is
// removed at the end, whatever happened.
//
// An agent that exits non-zero, or is killed for running past its timeout, is a result, not an
// error: it is recorded and measured like any other. Anything else that goes wrong makes the run
// `crashed`. Nothing is ever thrown: the scheduler's other runs go on.
import { moduleLogger } from "../../log/logger.ts";
import { patchRun, type RunProgress, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { ContainerRunRecord, Execution, RecordedMeasure, RecordedOutcome, RunDataStore } from "../../store/runDataStore.ts";
import { storedStderr } from "../agentOutput.ts";
import { recordedPostrunImage } from "../images.ts";
import { agentEnd, endedCleanly, failureHint, knownCost, totalTokens } from "../runFacts.ts";
import { RESULT_PATH, RUN_PATH, START_MARKER, STDERR_PATH, timedRun } from "../runScript.ts";
import { type SecretSearch, searchableSecrets, searchForSecrets } from "../secretSearch.ts";
import { parseExecution } from "./parseExecution.ts";
import { timed } from "./timed.ts";
import type { Collected, Dependencies, Manifest, PlannedPermutation, PlannedRun, RunRecord, UploadQueue } from "./types.ts";

const log = moduleLogger("execution");

type RunPermutationDeps = Pick<Dependencies, "runtimeDocker" | "env" | "clock" | "state" | "measurer"> & {
  /** The run data store, opened once for the execution. */
  store: RunDataStore;
};

/**
 * Runs `run`, one iteration of one of `manifest`'s permutations, writing where it has got to in
 * the state as it goes, and returns how it ended:
 *
 * - `finished`: the agent exited, with any exit code, and its run is committed, recorded and measured;
 * - `timedOut`: the same, but the agent was killed for running past its timeout;
 * - `crashed`: its container never started, or something failed on the way, with why in `error`.
 *   Its `record` is there if it had got as far as being recorded.
 *
 * With an image store, its postrun image is handed to `uploads`, never pushed here, so its slot
 * frees up without waiting for the upload. Never throws.
 */
export async function runPermutation(run: PlannedRun, manifest: Manifest, deps: RunPermutationDeps, uploads: UploadQueue): Promise<RunRecord> {
  const { runtimeDocker: docker, clock, state, store, measurer } = deps;
  const { runId, container } = run;
  const show = (progress: Partial<RunProgress>) => state.update(updateRun((s) => patchRun(s, runId, progress)));
  const at = { executionId: manifest.executionId, permutation: run.permutation, iteration: run.iteration };
  let record: ContainerRunRecord | undefined;
  try {
    const permutation = manifest.permutations.find(({ hash }) => hash === run.permutationHash);
    if (permutation === undefined) throw new Error(`Run ${runId} is of permutation ${run.permutationHash}, which its manifest doesn't have.`);
    const { harnessEnv, timeoutSeconds } = permutation;
    const collectOf = { root: manifest.root, harness: permutation.harness };

    show({ status: "running", startedAt: clock.now() });
    log.info({ ...at, permutationHash: permutation.hash }, "container run starting");
    // Variables are passed by name: Docker copies their values from Thunderjar's own environment.
    const stop = await timed(deps, "agent", () =>
      docker.run(permutation.prerunImage, container, timedRun(), {
        env: harnessEnv,
        secretEnv: manifest.secretEnv,
        setEnv: manifest.env,
        runOptions: permutation.runOptions,
        timeoutSeconds,
        startMarker: START_MARKER,
      }),
    );

    if (stop.outcome === "notStarted") {
      // Recorded, with why, but there is nothing to commit, push or measure.
      const execution: Execution = { startedAt: stop.spawnedAt, finishedAt: stop.gaveUpAt, exitCode: null, timedOut: false, timeoutSeconds, failedToStart: stop.reason };
      const left = { harnessResult: null, harnessStderr: null };
      record = containerRunRecord(manifest, permutation, run, execution, left, await measurer.collect(collectOf, null));
      await store.recordContainerRun(record);
      log.warn({ ...at, reason: stop.reason }, "container didn't start");
      show({ status: "crashed", error: stop.reason, ...ending(record) });
      return { runId, status: "crashed", record, error: stop.reason };
    }

    const killedAt = stop.outcome === "timedOut" ? stop.killedAt : undefined;
    const [execution, harnessResult, stderr] = await timed(deps, "collect", async () => [
      parseExecution(await docker.readFile(container, RUN_PATH), timeoutSeconds, killedAt),
      (await docker.readFile(container, RESULT_PATH)) ?? null,
      (await docker.readFile(container, STDERR_PATH)) ?? null,
    ] as const);

    show({ status: "committing" });
    await timed(deps, "commit", () => docker.commit(container, run.postrunImage, permutation.prerunImage, manifest.env));
    show({ status: "committed" });

    // Before the postrun image goes to the image store: in the files it would push, for the values
    // of the variables the agent was given by name. Not at all, and not timed, if there are none.
    const given = [...harnessEnv, ...manifest.secretEnv];
    const secrets =
      searchableSecrets(given, deps.env.variables).length === 0
        ? undefined
        : await timed(deps, "secretSearch", () => searchForSecrets(run.postrunImage, `${container}-secrets`, given, docker, deps.env.variables));

    const collected = await measurer.collect(collectOf, harnessResult);
    record = containerRunRecord(manifest, permutation, run, execution, { harnessResult, harnessStderr: storedStderr(stderr) }, collected, secrets);
    await store.recordContainerRun(record);
    log.info({ ...at, exitCode: execution.exitCode, timedOut: execution.timedOut, tokenCosts: record.tokenCosts }, "container run finished");
    // Names and paths only, never a value.
    if (record.secretsFound !== undefined) log.warn({ ...at, secretsFound: record.secretsFound }, "secrets found in the postrun image's files");
    if (record.secretSearchFailed !== undefined) log.warn({ ...at, reason: record.secretSearchFailed }, "couldn't search the postrun image for secrets");

    // Pushed by the queue, while this run is measured and the next one starts: both only read the image.
    if (run.storedPostrunImage !== undefined) uploads.enqueue({ runId, image: run.postrunImage, reference: run.storedPostrunImage });

    show({ status: "measuring" });
    const result = await timed(deps, "measure", () =>
      measurer.measure(
        // The variables the agent was given by name: its postrun image has them blank.
        { root: manifest.root, task: manifest.task, postrunImage: run.postrunImage, container, secretEnv: [...new Set(given)] },
        { harnessResult, reply: collected.reply },
      ),
    );
    if (Object.keys(result).length > 0) {
      record = { ...record, result };
      await store.recordContainerRun(record);
    }

    const status = execution.timedOut ? "timedOut" : "finished";
    // Its upload may have ended while it was measured: what the queue's listener wrote is the later news.
    const shown = state.get().run.runs[runId]?.status;
    const uploading = status === "finished" && (shown === "uploading" || shown === "uploaded");
    show({ ...(!uploading && { status }), ...ending(record) });
    return { runId, status, record };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ ...at, error: message }, "container run crashed");
    show({ status: "crashed", error: message, finishedAt: clock.now() });
    return { runId, status: "crashed", error: message, ...(record !== undefined && { record }) };
  } finally {
    await docker.removeContainer(container).catch((error: unknown) => {
      log.warn({ ...at, container, error: error instanceof Error ? error.message : String(error) }, "couldn't remove the container");
    });
  }
}

/** What a recorded run shows once it is over: how it ended and when, what it cost, its measures, and a hint if it didn't end cleanly. */
function ending(record: ContainerRunRecord): Partial<RunProgress> {
  const { execution, harnessResult, harnessStderr, tokenCosts, result } = record;
  const costUsd = knownCost(tokenCosts);
  const tokens = totalTokens(tokenCosts);
  const hint = endedCleanly(execution, harnessResult) ? undefined : failureHint({ harnessStderr, harnessResult, execution });
  return {
    outcome: agentEnd(execution, harnessResult),
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    ...(costUsd !== undefined && { costUsd }),
    ...(tokens !== undefined && { tokens }),
    ...(Object.keys(result).length > 0 && { measures: formatMeasures(result) }),
    ...(hint !== undefined && { hint }),
  };
}

/** A measured value as it's shown: JSON, but with an object's keys unquoted, `{passed: 4, failed: 1}`. */
const formatValue = (value: unknown): string =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? `{${Object.entries(value)
        .map(([key, v]) => `${key}: ${formatValue(v)}`)
        .join(", ")}}`
    : (JSON.stringify(value) ?? String(value));

/** A measure as it's shown: its value, or why it has none. */
const formatOutcome = (outcome: RecordedOutcome): string =>
  outcome.outcome === "measured"
    ? formatValue(outcome.data)
    : outcome.outcome === "skipped"
      ? `skipped${outcome.reason ? ` (${outcome.reason})` : ""}`
      : `erroredWhileMeasuring (${outcome.error.message})`;

/** Each measure of `result`, by name, as it's shown, e.g. `{ tests: "{passed: 4, failed: 1}", polite: "true" }`. */
export const formatMeasures = (result: Record<string, RecordedMeasure>): Record<string, string> =>
  Object.fromEntries(Object.entries(result).map(([name, { outcome }]) => [name, formatOutcome(outcome)]));

/** The record of `run`, an iteration of `permutation`, as it ran in `manifest`'s execution. */
function containerRunRecord(
  manifest: Manifest,
  permutation: PlannedPermutation,
  run: PlannedRun,
  execution: Execution,
  left: { harnessResult: string | null; harnessStderr: string | null },
  { reply, tokenCosts }: Collected,
  secrets?: SecretSearch,
): ContainerRunRecord {
  const { harness, harnessEnv } = permutation;
  return {
    executionId: manifest.executionId,
    testCase: manifest.testCase,
    task: manifest.task,
    permutation: permutation.number,
    permutationHash: permutation.hash,
    iteration: run.iteration,
    // Where the postrun image is kept: the image store's reference, as the local name lives only on the runtime.
    postrunImage: recordedPostrunImage(run.postrunImage, run.storedPostrunImage),
    ranAt: new Date(execution.startedAt).toISOString(),
    parameters: Object.fromEntries(
      permutation.parameters.map(({ axis, name, parameterHash, resolved }) => [axis, { name, parameterHash, ...(resolved !== undefined && { resolved }) }]),
    ) as ContainerRunRecord["parameters"],
    harnessModel: { harness: harness.name, version: harness.version, modelId: harness.modelId },
    // Only when the test case gives them. A secret's name, never its value.
    ...(Object.keys(manifest.env).length > 0 && { env: manifest.env }),
    ...(manifest.secretEnv.length > 0 && { secretEnv: manifest.secretEnv }),
    ...(harnessEnv.length > 0 && { harnessEnv }),
    execution,
    harnessResult: left.harnessResult,
    harnessStderr: left.harnessStderr,
    reply,
    tokenCosts,
    result: {},
    // Only when one was found: a clean run's record is as it was before secrets were looked for.
    ...(secrets !== undefined && "found" in secrets && secrets.found.length > 0 && { secretsFound: secrets.found }),
    ...(secrets !== undefined && "failed" in secrets && { secretSearchFailed: secrets.failed }),
  };
}
