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
import { recordedPostrunImage } from "../../execution/images.ts";
import { measureContainerRun } from "../../execution/measure.ts";
import { measurementContextOver, recordedContext } from "../../execution/measurementContext.ts";
import { collectReply } from "../../execution/reply.ts";
import { RESULT_PATH, RUN_PATH, START_MARKER, STDERR_PATH, timedRun } from "../../execution/runScript.ts";
import { parseSecretSearch, SECRET_SEARCH_PATH, type SecretSearch, searchableSecrets, secretSearchScript, secretSearchTimeoutSeconds } from "../../execution/secretSearch.ts";
import { collectTokenCosts } from "../../execution/tokenCosts.ts";
import { moduleLogger } from "../../log/logger.ts";
import type { ContainerRunRecord, Execution } from "../../services/RunDataStore/RunDataStore.ts";
import { logEvent, setRun, timed } from "../state/state.ts";
import type { Dependencies, Manifest, PlannedRun, RunRecord } from "../types.ts";
import type { UploadQueue } from "../uploadQueue/uploadQueue.ts";

const log = moduleLogger("execution");

type Deps = Pick<Dependencies, "runtimeDocker" | "runStore" | "env" | "clock" | "state">;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Searches the files of `run`'s post-run image for the values of the secret variables its agent
 * was given by name. Undefined, and no container, if none is worth searching for. Never throws: a
 * search that fails, or takes too long, is `failed`, with why, and the run goes on.
 */
async function searchForSecrets(run: PlannedRun, deps: Deps): Promise<SecretSearch | undefined> {
  const searched = searchableSecrets([...run.permutation.env, ...run.permutation.secretEnv], deps.env.variables);
  if (searched.length === 0) return undefined;
  return timed(deps, "secretSearch", () => search(run, searched, deps));
}

async function search(run: PlannedRun, searched: string[], deps: Deps): Promise<SecretSearch> {
  const container = `${run.container}-secrets`;
  const timeoutSeconds = secretSearchTimeoutSeconds();
  try {
    // As root, to read every file; with no network, as it needs none.
    const stop = await deps.runtimeDocker.run(run.postrunImage, container, secretSearchScript(searched), {
      env: searched,
      runOptions: ["--user", "0", "--network", "none"],
      timeoutSeconds,
    });
    if (stop.outcome !== "exited") return { failed: `it took longer than ${timeoutSeconds}s` };
    const found = parseSecretSearch(await deps.runtimeDocker.readFile(container, SECRET_SEARCH_PATH), searched);
    return typeof found === "string" ? { failed: found } : { found };
  } catch (error) {
    return { failed: message(error) };
  } finally {
    await deps.runtimeDocker.removeContainer(container).catch(() => {});
  }
}

/** What a run left, read from its container before it's committed. */
type Left = { execution: Execution; harnessResult: string | null; stderr: string | null; secrets?: SecretSearch };

/** The record of `run`, as it ran. */
function containerRunRecord(manifest: Manifest, run: PlannedRun, left: Left): ContainerRunRecord {
  const { permutation } = run;
  const { hashed } = permutation;
  const { secrets } = left;
  return {
    executionId: manifest.executionId,
    testCase: manifest.testCaseName,
    task: manifest.task,
    permutation: permutation.number,
    permutationHash: permutation.hash,
    iteration: run.iteration,
    // Where it's kept: the image store's reference, as the local name lives only on the runtime.
    postrunImage: recordedPostrunImage(run.postrunImage, run.storedPostrunImage),
    ranAt: new Date(left.execution.startedAt).toISOString(),
    parameters: Object.fromEntries(
      AXES.map((axis) => [
        axis,
        { name: hashed[axis], parameterHash: hashed.parameterHashes[axis], ...(hashed.resolved[axis] !== undefined && { resolved: hashed.resolved[axis] }) },
      ]),
    ) as ContainerRunRecord["parameters"],
    harnessModel: { harness: parsePair(hashed.harnessModel).harness, version: permutation.version, modelId: permutation.modelId },
    // Only when the test case gives them. A secret's name, never its value.
    ...(Object.keys(permutation.testCaseEnv).length > 0 && { env: permutation.testCaseEnv }),
    ...(permutation.secretEnv.length > 0 && { secretEnv: permutation.secretEnv }),
    ...(permutation.env.length > 0 && { harnessEnv: permutation.env }),
    execution: left.execution,
    harnessResult: left.harnessResult,
    harnessStderr: storedStderr(left.stderr),
    reply: collectReply(permutation.harness.collectReply, left.harnessResult),
    tokenCosts: collectTokenCosts(permutation.collectTokenCosts, [left.harnessResult], { version: permutation.version, modelId: permutation.modelId }),
    result: {},
    // Only when one was found: a clean run's record is as it was before secrets were looked for.
    ...(secrets !== undefined && "found" in secrets && secrets.found.length > 0 && { secretsFound: secrets.found }),
    ...(secrets !== undefined && "failed" in secrets && { secretSearchFailed: secrets.failed }),
  };
}

/**
 * Must never throw: a crash or timeout comes back as a `RunRecord` with that outcome.
 *
 * Runs the agent in a container from the permutation's pre-run image, commits it into the post-run
 * image, records the run, hands the image to `uploads`, and takes the task's measurements in a
 * throwaway container from the post-run image. A run that times out is committed and recorded, but
 * not measured. One whose container never starts, or that Docker or the run data store fails
 * under, is `crashed`: recorded if it can be, with why, and neither committed nor measured.
 */
export async function runPermutation(run: PlannedRun, deps: Deps, uploads: UploadQueue): Promise<RunRecord> {
  const { runId, permutation } = run;
  const manifest = deps.state.get().run.manifest as Manifest;
  const docker = deps.runtimeDocker;
  const at = { executionId: manifest.executionId, permutation: permutation.number, iteration: run.iteration };
  const startedAt = deps.clock.now();
  let record: ContainerRunRecord | undefined;
  const crashed = async (reason: string, execution?: Execution): Promise<RunRecord> => {
    log.warn({ ...at, reason }, "run crashed");
    const finishedAt = deps.clock.now();
    // Recorded once, as it ran, if it got that far; otherwise as a run that failed to start.
    if (record === undefined) {
      const failed: Execution = execution ?? { startedAt, finishedAt, exitCode: null, timedOut: false, timeoutSeconds: permutation.timeoutSeconds, failedToStart: reason };
      record = containerRunRecord(manifest, run, { execution: failed, harnessResult: null, stderr: null });
      await deps.runStore.recordContainerRun(record).catch((error: unknown) => log.error({ ...at, err: error }, "couldn't record the crashed run"));
      logEvent(deps, { type: "run", runId, step: "ran", record });
    }
    setRun(deps, runId, "crashed");
    logEvent(deps, { type: "run", runId, step: "done" });
    return { runId, outcome: "crashed", startedAt, finishedAt, exitCode: null, reason };
  };
  try {
    setRun(deps, runId, "running");
    logEvent(deps, { type: "run", runId, step: "started" });
    log.info({ ...at, permutationHash: permutation.hash }, "container run starting");
    let left: Left;
    try {
      const stop = await timed(deps, "agent", () =>
        docker.run(permutation.runImage, run.container, timedRun(), {
          env: permutation.env,
          runOptions: permutation.runOptions,
          setEnv: permutation.testCaseEnv,
          secretEnv: permutation.secretEnv,
          timeoutSeconds: permutation.timeoutSeconds,
          startMarker: START_MARKER,
        }),
      );
      if (stop.outcome === "notStarted") {
        log.warn({ ...at, reason: stop.reason }, "container didn't start");
        return await crashed(stop.reason, {
          startedAt: stop.spawnedAt,
          finishedAt: stop.gaveUpAt,
          exitCode: null,
          timedOut: false,
          timeoutSeconds: permutation.timeoutSeconds,
          failedToStart: stop.reason,
        });
      }
      const killedAt = stop.outcome === "timedOut" ? stop.killedAt : undefined;
      const [execution, harnessResult, stderr] = await timed(deps, "collect", async () => [
        parseExecution(await docker.readFile(run.container, RUN_PATH), permutation.timeoutSeconds, killedAt),
        (await docker.readFile(run.container, RESULT_PATH)) ?? null,
        (await docker.readFile(run.container, STDERR_PATH)) ?? null,
      ] as const);
      setRun(deps, runId, "committing");
      await timed(deps, "commit", () => docker.commit(run.container, run.postrunImage, permutation.runImage, permutation.testCaseEnv));
      // Before the post-run image is pushed: in the files it would push, for the values of the
      // variables the agent was given by name.
      const secrets = await searchForSecrets(run, deps);
      left = { execution, harnessResult, stderr, ...(secrets !== undefined && { secrets }) };
    } finally {
      await docker.removeContainer(run.container).catch(() => {});
    }

    // Assigned only once it's stored, so a store that fails here is recorded again as a crash, with its `ran` event.
    const ran = containerRunRecord(manifest, run, left);
    const { execution } = left;
    await deps.runStore.recordContainerRun(ran);
    record = ran;
    log.info({ ...at, exitCode: execution.exitCode, timedOut: execution.timedOut, tokenCosts: record.tokenCosts }, "container run finished");
    // What the agent said, so the log says why it failed: its stderr is otherwise lost.
    const output = agentOutput([left.harnessResult], [left.stderr]);
    if (execution.timedOut) log.warn({ ...at, timeoutSeconds: execution.timeoutSeconds, output }, "agent timed out");
    else if (execution.exitCode !== 0) log.warn({ ...at, exitCode: execution.exitCode, output }, "agent exited non-zero");
    // Names and paths only, never a value.
    if (record.secretsFound !== undefined) log.warn({ ...at, secretsFound: record.secretsFound }, "secrets found in the postrun image's files");
    if (record.secretSearchFailed !== undefined) log.warn({ ...at, reason: record.secretSearchFailed }, "couldn't search the postrun image for secrets");
    if (record.tokenCosts?.outcome === "unavailable" && record.tokenCosts.reason === "unparseable") {
      log.warn({ ...at, result: left.harnessResult && head(left.harnessResult, 500) }, "token costs unparseable from the result file");
    }
    setRun(deps, runId, execution.timedOut ? "timedOut" : "committed");
    logEvent(deps, { type: "run", runId, step: "ran", record });

    // The run's slot frees up without waiting for the push.
    if (run.storedPostrunImage !== undefined) uploads.enqueue({ runId, image: run.postrunImage, reference: run.storedPostrunImage });

    const { measurements } = manifest.config;
    if (!execution.timedOut && measurements.length > 0) {
      logEvent(deps, { type: "run", runId, step: "measuring" });
      let opened = 0;
      const recorded = { harnessResult: record.harnessResult ?? "", reply: record.reply as Reply, replies: [record.reply as Reply] };
      // The variables the agent was given by name: its post-run image has them blank.
      const secretEnv = [...new Set([...permutation.env, ...permutation.secretEnv])];
      const open = async (usesContainer: boolean) =>
        usesContainer
          ? measurementContextOver(await docker.openShellSession(run.postrunImage, `${run.container}-measure-${++opened}`, secretEnv), recorded)
          : recordedContext(recorded);
      try {
        const result = await timed(deps, "measure", () => measureContainerRun(measurements, open, () => new Date(deps.clock.now())));
        record = { ...record, result };
        await deps.runStore.recordContainerRun(record);
        log.info({ ...at, containers: opened, result }, "measured");
        logEvent(deps, { type: "run", runId, step: "measured", result });
      } catch (error) {
        // Open in the architecture plan: here, a measurement container that can't be used crashes the run.
        logEvent(deps, { type: "run", runId, step: "measureFailed", reason: message(error) });
        return await crashed(`Measuring failed: ${message(error)}`);
      }
    }
    logEvent(deps, { type: "run", runId, step: "done" });
    return {
      runId,
      outcome: execution.timedOut ? "timedOut" : "completed",
      startedAt,
      finishedAt: deps.clock.now(),
      exitCode: execution.exitCode,
      postrunImage: record.postrunImage,
    };
  } catch (error) {
    try {
      return await crashed(message(error));
    } catch (again) {
      log.error({ ...at, err: again }, "couldn't mark the run as crashed");
      return { runId, outcome: "crashed", startedAt, finishedAt: deps.clock.now(), exitCode: null, reason: message(error) };
    }
  }
}
