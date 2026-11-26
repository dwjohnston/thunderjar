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

// One run: start → secrets → agent → wait → commit, then measure and upload in parallel.
import type { Reply } from "../../api/declarations.ts";
import { AXES, parsePair } from "../../config/permutations.ts";
import { agentOutput, head, storedStderr } from "../../execution/agentOutput.ts";
import { parseExecution } from "../../execution/containerRun.ts";
import { measureContainerRun } from "../../execution/measure.ts";
import { openMeasurementContext, recordedContext } from "../../execution/measurementContext.ts";
import { collectReply } from "../../execution/reply.ts";
import { RESULT_PATH, RUN_PATH, START_MARKER, STDERR_PATH, timedRun } from "../../execution/runScript.ts";
import { searchableSecrets, searchForSecrets, type SecretSearch } from "../../execution/secretSearch.ts";
import { collectTokenCosts } from "../../execution/tokenCosts.ts";
import { moduleLogger } from "../../log/logger.ts";
import { patchRun, type RunProgress, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { ContainerRunRecord, Execution } from "../../services/RunDataStore/RunDataStore.ts";
import { runsFrom } from "../plan/plan.ts";
import { timed } from "../timed/timed.ts";
import type { Dependencies, Manifest, PlannedPermutation, PlannedRun, ResolvedPermutation, RunOutcome, RunRecord, TestCaseConfig } from "../types.ts";
import type { UploadQueue } from "../uploadQueue/uploadQueue.ts";

const log = moduleLogger("runNext");

/** What a run is part of: the manifest it's planned in, and the config with what the manifest leaves out, e.g. its harness's functions. */
export type RunContext = { manifest: Manifest; config: TestCaseConfig };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How the agent ended: a timeout, or a non-zero exit, isn't `completed`. */
const outcomeOf = (execution: Execution): RunOutcome => (execution.timedOut ? "timedOut" : execution.exitCode !== 0 ? "crashed" : "completed");

/** The run's record for the run data store, before it's measured. */
function containerRunRecord(
  run: PlannedRun,
  { manifest }: RunContext,
  planned: PlannedPermutation,
  resolved: ResolvedPermutation,
  execution: Execution,
  left: { harnessResult: string | null; stderr: string | null },
  secrets?: SecretSearch,
): ContainerRunRecord {
  const { permutation: hashed } = resolved;
  return {
    executionId: manifest.executionId,
    testCase: manifest.testCaseName,
    task: manifest.task,
    permutation: planned.number,
    permutationHash: planned.hash,
    iteration: run.iteration,
    // Where it's pushed, with an image store: its local name may exist only on a runtime that's gone.
    postrunImage: run.storedPostrunImage ?? run.postrunImage,
    ranAt: new Date(execution.startedAt).toISOString(),
    parameters: Object.fromEntries(
      AXES.map((axis) => [
        axis,
        { name: hashed[axis], parameterHash: hashed.parameterHashes[axis], ...(hashed.resolved[axis] !== undefined && { resolved: hashed.resolved[axis] }) },
      ]),
    ) as ContainerRunRecord["parameters"],
    harnessModel: { harness: parsePair(hashed.harnessModel).harness, version: resolved.version, modelId: resolved.modelId },
    // Only when the test case gives them. A secret's name, never its value.
    ...(Object.keys(planned.testCaseEnv).length > 0 && { env: planned.testCaseEnv }),
    ...(planned.secretEnv.length > 0 && { secretEnv: planned.secretEnv }),
    ...(planned.env.length > 0 && { harnessEnv: planned.env }),
    execution,
    harnessResult: left.harnessResult,
    harnessStderr: storedStderr(left.stderr),
    reply: collectReply(resolved.harness.collectReply, left.harnessResult),
    tokenCosts: collectTokenCosts(resolved.collectTokenCosts, [left.harnessResult], { version: resolved.version, modelId: resolved.modelId }),
    result: {},
    ...(secrets !== undefined && "found" in secrets && secrets.found.length > 0 && { secretsFound: secrets.found }),
    ...(secrets !== undefined && "failed" in secrets && { secretSearchFailed: secrets.failed }),
  };
}

/**
 * Must never throw: a crash or timeout comes back as a `RunRecord` with that outcome.
 *
 * - A container that never starts is `crashed`, recorded with why, with nothing to commit.
 * - An agent that exits non-zero (`crashed`) or is killed at its timeout (`timedOut`) is committed,
 *   recorded and uploaded, but not measured.
 * - If Docker or the run data store fails under it, it's `crashed`, with why in `error`.
 * - If only measuring fails, it stays `completed`, with why in `error`.
 */
export async function runPermutation(
  run: PlannedRun,
  context: RunContext,
  deps: Pick<Dependencies, "runtimeDocker" | "runStore" | "env" | "clock" | "state">,
  uploads: UploadQueue,
): Promise<RunRecord> {
  const { runtimeDocker: docker, runStore, clock, state, env } = deps;
  const { manifest, config } = context;
  const set = (progress: Partial<RunProgress>) => state.update(updateRun((s) => patchRun(s, run.runId, progress)));
  const at = { executionId: manifest.executionId, runId: run.runId, permutation: run.permutation, iteration: run.iteration };
  const spawnedAt = clock.now();
  let record: ContainerRunRecord | undefined;
  let outcome: RunOutcome = "crashed";
  const result = (error?: string): RunRecord => ({
    runId: run.runId,
    outcome,
    startedAt: record?.execution.startedAt ?? spawnedAt,
    finishedAt: record?.execution.finishedAt ?? clock.now(),
    ...(record !== undefined && !record.execution.failedToStart && { postrunImage: record.postrunImage }),
    ...(record !== undefined && { containerRun: record }),
    ...(error !== undefined && { error }),
  });
  try {
    const planned = manifest.permutations.find((permutation) => permutation.number === run.permutation);
    const resolved = config.permutations.find((permutation) => permutation.number === run.permutation);
    if (planned === undefined || resolved === undefined) throw new Error(`Run ${run.runId} has no permutation ${run.permutation}.`);
    const prerunImage = runsFrom(planned);
    set({ status: "running", startedAt: spawnedAt });
    log.info({ ...at, permutationHash: planned.hash, prerunImage }, "container run starting");
    const stop = await timed(deps, "agent", () =>
      docker.run(prerunImage, run.container, timedRun(), {
        env: planned.env,
        runOptions: planned.runOptions,
        setEnv: planned.testCaseEnv,
        secretEnv: planned.secretEnv,
        timeoutSeconds: planned.timeoutSeconds,
        startMarker: START_MARKER,
      }),
    );
    if (stop.outcome === "notStarted") {
      const execution: Execution = {
        startedAt: stop.spawnedAt,
        finishedAt: stop.gaveUpAt,
        exitCode: null,
        timedOut: false,
        timeoutSeconds: planned.timeoutSeconds,
        failedToStart: stop.reason,
      };
      record = containerRunRecord(run, context, planned, resolved, execution, { harnessResult: null, stderr: null });
      await runStore.recordContainerRun(record);
      log.warn({ ...at, reason: stop.reason }, "container didn't start");
      set({ status: "crashed", finishedAt: stop.gaveUpAt, record, error: `Its container didn't start: ${stop.reason}` });
      return result();
    }
    const killedAt = stop.outcome === "timedOut" ? stop.killedAt : undefined;
    const [execution, harnessResult, stderr] = await timed(deps, "collect", async () =>
      [
        parseExecution(await docker.readFile(run.container, RUN_PATH), planned.timeoutSeconds, killedAt),
        (await docker.readFile(run.container, RESULT_PATH)) ?? null,
        (await docker.readFile(run.container, STDERR_PATH)) ?? null,
      ] as const,
    );
    set({ status: "committing", startedAt: execution.startedAt, finishedAt: execution.finishedAt });
    await timed(deps, "commit", () => docker.commit(run.container, run.postrunImage, prerunImage, planned.testCaseEnv));
    // Before the postrun image is pushed: in the files it would push, for the values of the variables the agent was given by name.
    const secretNames = searchableSecrets([...planned.env, ...planned.secretEnv], env.variables);
    const secrets =
      secretNames.length === 0
        ? undefined
        : await timed(deps, "secretSearch", () => searchForSecrets(run.postrunImage, `${run.container}-secrets`, secretNames, docker, env.variables));
    record = containerRunRecord(run, context, planned, resolved, execution, { harnessResult, stderr }, secrets);
    await runStore.recordContainerRun(record);
    outcome = outcomeOf(execution);
    log.info({ ...at, outcome, exitCode: execution.exitCode, timedOut: execution.timedOut, tokenCosts: record.tokenCosts }, "container run finished");
    // What the agent said, so the log says why it failed: its stderr is otherwise lost.
    if (outcome !== "completed") log.warn({ ...at, outcome, output: agentOutput([harnessResult], [stderr]) }, "agent didn't end cleanly");
    // Names and paths only, never a value.
    if (record.secretsFound !== undefined) log.warn({ ...at, secretsFound: record.secretsFound }, "secrets found in the postrun image's files");
    if (record.secretSearchFailed !== undefined) log.warn({ ...at, reason: record.secretSearchFailed }, "couldn't search the postrun image for secrets");
    const { tokenCosts } = record;
    if (tokenCosts?.outcome === "unavailable" && tokenCosts.reason === "unparseable") {
      log.warn({ ...at, result: harnessResult && head(harnessResult, 500) }, "token costs unparseable from the result file");
    }
    set({ status: outcome === "completed" ? "committed" : outcome, record });
    // From the commit, the upload and the measurements go at once: both only read the postrun image.
    if (run.storedPostrunImage !== undefined) uploads.enqueue({ runId: run.runId, image: run.postrunImage, reference: run.storedPostrunImage });
    if (outcome !== "completed" || config.measurements.length === 0) return result();

    set({ measuring: "measuring" });
    try {
      let opened = 0;
      const reply = record.reply as Reply;
      const recorded = { harnessResult: harnessResult ?? "", reply, replies: [reply], collectSkillsInvoked: resolved.harness.collectSkillsInvoked, collectToolCalls: resolved.harness.collectToolCalls };
      // The variables the agent was given by name: its postrun image has them blank.
      const secretEnv = [...new Set([...planned.env, ...planned.secretEnv])];
      // In a throwaway container from the postrun image, so the image is exactly what the agent left.
      const open = async (usesContainer: boolean) =>
        usesContainer ? openMeasurementContext(run.postrunImage, `${run.container}-measure-${++opened}`, recorded, docker, secretEnv) : recordedContext(recorded);
      const measures = await timed(deps, "measure", () => measureContainerRun(config.measurements, open, () => new Date(clock.now())));
      record = { ...record, result: measures };
      await runStore.recordContainerRun(record);
      log.info({ ...at, containers: opened, result: measures }, "measured");
      set({ measuring: "measured", record });
      return result();
    } catch (error) {
      log.error({ ...at, err: error }, "measuring failed");
      const why = `Measuring it failed: ${message(error)}`;
      set({ measuring: undefined, error: why });
      return result(why);
    }
  } catch (error) {
    log.error({ ...at, err: error }, "container run failed");
    outcome = "crashed";
    set({ status: "crashed", finishedAt: clock.now(), error: message(error) });
    return result(message(error));
  } finally {
    await docker.removeContainer(run.container).catch(() => {});
  }
}
