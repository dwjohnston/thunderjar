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

// Level 1: from the command line to a resolved test case, a mode and an output format.
import { ConfigError, findThunderjarRoot } from "../../config/loader.ts";
import { loadMeasurements } from "../../config/measurements.ts";
import type { Overrides } from "../../config/overrides.ts";
import { checkBuildSecrets, loadProjectConfig, registryHost } from "../../config/projectConfig.ts";
import { checkRequiredEnv } from "../../config/requiredEnv.ts";
import { loadTestCase } from "../../config/testCase.ts";
import { DockerLoginError } from "../../docker/docker.ts";
import { DEFAULT_IMAGE_PREFIX, executionContainerPrefix } from "../../execution/images.ts";
import { ImageStoreLoginError } from "../../execution/imageStore.ts";
import { planExecution } from "../../execution/planExecution.ts";
import { moduleLogger } from "../../log/logger.ts";
import { addNote, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { StopSignal } from "../../services/Io/Io.ts";
import { runHook } from "../hooks/hooks.ts";
import { runTestCase } from "../runTestCase/runTestCase.ts";
import type { Dependencies, OutputFormat, RunMode, RunOptions, RunRecord, RunResult, TestCaseConfig } from "../types.ts";

const log = moduleLogger("runNext");

/** How long an interrupted run waits for its execution to be recorded as failed, before it runs `afterExecution` and gives up on it. */
const INTERRUPT_SETTLE_MS = 15_000;

/** What the test case is resolved with, besides its name: the overrides, and the options that shape the execution. */
export type Given = { overrides: Overrides } & Pick<RunOptions, "concurrency" | "imagePrefix">;

/**
 * Runs test case `testCaseName`, as far as its mode goes, and returns the exit code: 1 if any run
 * didn't complete, or the execution failed. An error is left in the state, for `--json`, and
 * thrown: the command says what went wrong. Asked to stop, it removes the execution's containers,
 * and returns 130 (SIGINT) or 143 (SIGTERM) once the execution is recorded as failed.
 */
export async function runCommand(testCaseName: string, options: RunOptions, deps: Dependencies): Promise<RunResult> {
  const { overrides, mode, output } = splitOptions(options);
  const { displayer, state } = deps;
  const stopping = new AbortController();
  const live: Dependencies = { ...deps, signal: stopping.signal };
  let config: TestCaseConfig | undefined;

  let shown = false;
  const stopDisplayer = () => {
    if (shown) return;
    shown = true;
    displayer.stop(); // interactive: final frame; json: write the result to stdout
  };

  let running: Promise<RunRecord[] | undefined> | undefined;
  const interrupted = Promise.withResolvers<number>();
  const interrupt = async (signal: StopSignal) => {
    if (stopping.signal.aborted) return;
    stopping.abort();
    const manifest = state.get().run.manifest;
    const code = signal === "SIGINT" ? 130 : 143;
    state.update(updateRun((run) => ({ ...run, error: run.error ?? `Interrupted (${signal})` })));
    if (manifest === undefined || config === undefined || mode === "dry-run") return interrupted.resolve(code);
    deps.stderr.write(`Interrupted (${signal}): stopping execution ${manifest.executionId}'s containers.\n`);
    try {
      const removed = await deps.runtimeDocker.removeContainersNamed(executionContainerPrefix(manifest.executionId, manifest.imagePrefix));
      log.warn({ executionId: manifest.executionId, removed }, "execution interrupted: removed its containers");
    } catch (error) {
      deps.stderr.write(`Couldn't remove its containers: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    // Its runs fail, now their containers are gone: once they have, the execution is recorded as failed.
    await Promise.race([running?.catch(() => {}), deps.clock.sleep(INTERRUPT_SETTLE_MS)]);
    // Level 2 runs it as it ends; this is for one that didn't end in time. It runs once.
    await runHook("afterExecution", manifest, config).catch((error: unknown) => deps.stderr.write(`The runtime's afterExecution failed: ${error instanceof Error ? error.message : String(error)}\n`));
    interrupted.resolve(code);
  };
  const unlisten = deps.onStop((signal) => void interrupt(signal));

  displayer.setMode(output);
  displayer.start();
  try {
    config = await resolveTestCase(testCaseName, { overrides, concurrency: options.concurrency, imagePrefix: options.imagePrefix }, live);
    if (options.timings) state.update(updateRun((run) => ({ ...run, showTimings: true })));
    if (mode !== "dry-run") {
      await preflight(config, live);
      const recordedIn = await deps.runStoreLocation();
      state.update(updateRun((run) => ({ ...run, recordedIn })));
    }
    running = runTestCase(config, live, mode);
    // Awaited below, unless it's interrupted first: then nothing waits for it.
    running.catch(() => {});
    const outcome = await Promise.race([running.then((records) => ({ records })), interrupted.promise.then((exitCode) => ({ exitCode }))]);
    if ("exitCode" in outcome) return { exitCode: outcome.exitCode };
    if (stopping.signal.aborted) return { exitCode: await interrupted.promise, records: outcome.records };
    const { execution, error } = state.get().run;
    return { exitCode: execution?.status === "failed" || error !== undefined ? 1 : 0, records: outcome.records };
  } catch (error) {
    if (stopping.signal.aborted) return { exitCode: await interrupted.promise };
    const why = error instanceof ConfigError ? error.problems.join("\n") : error instanceof Error ? error.message : String(error);
    state.update(updateRun((run) => ({ ...run, error: run.error ?? why })));
    throw error;
  } finally {
    unlisten();
    stopDisplayer();
  }
}

/** Overrides go into the config, the mode goes to level 2, the output format only to the displayer. */
export function splitOptions(options: RunOptions): { overrides: Overrides; mode: RunMode; output: OutputFormat } {
  const { dryRun, buildOnly, json, concurrency: _concurrency, imagePrefix: _imagePrefix, timings: _timings, ...overrides } = options;
  if (dryRun && buildOnly) throw new ConfigError("--dry-run and --build-only can't be used together.");
  return {
    overrides,
    mode: dryRun ? "dry-run" : buildOnly ? "build-only" : "full",
    output: json ? "json" : "interactive",
  };
}

/**
 * Finds the test case on the filesystem, applies the overrides, and reads everything else an
 * execution of it needs from the project: its config, each permutation's parameters, hashed, and
 * the task's measurements. Throws a ConfigError if any of it is wrong, or a variable a harness or
 * the test case needs is unset. A deprecated config field is a warning on stderr.
 */
export async function resolveTestCase(testCaseName: string, given: Given, deps: Pick<Dependencies, "env" | "settings" | "stderr" | "state">): Promise<TestCaseConfig> {
  const { env } = deps;
  const root = await findThunderjarRoot(env.cwd);
  const project = await loadProjectConfig(root);
  for (const deprecation of project.deprecations) {
    deps.stderr.write(`Warning: ${deprecation}\n`);
    deps.state.update(updateRun((run) => addNote(run, deprecation)));
  }
  const testCase = await loadTestCase(root, testCaseName, given.overrides);
  await checkRequiredEnv(root, testCase, env.variables);
  const imagePrefix = given.imagePrefix ?? DEFAULT_IMAGE_PREFIX;
  // The execution ID only names post-run images, which `plan` names itself.
  const { permutations } = await planExecution(root, testCase, "unplanned", imagePrefix);
  const measurements = await loadMeasurements(root, testCase.task);
  const { runtime } = project;
  return {
    ...testCase,
    name: testCaseName,
    root,
    overrides: given.overrides,
    imagePrefix,
    concurrency: given.concurrency ?? deps.settings.concurrency ?? runtime?.concurrency ?? 1,
    imageStore: project.imageStore,
    build: project.build,
    hooks: {
      ...(runtime?.beforeExecution !== undefined && { beforeExecution: runtime.beforeExecution }),
      ...(runtime?.afterExecution !== undefined && { afterExecution: runtime.afterExecution }),
    },
    permutations: permutations.map(({ iterations: _iterations, ...permutation }) => permutation),
    measurements,
  };
}

/**
 * What must hold before anything is built or run, so it fails in seconds, not after the agents
 * have run: each build secret's variable is set (a ConfigError), Docker has a login for the image
 * store's registry (an ImageStoreLoginError, or a DockerUnavailableError), and the run data store
 * can be used (a RunDataStoreError).
 */
export async function preflight(config: TestCaseConfig, deps: Pick<Dependencies, "env" | "hostDocker" | "runStore">): Promise<void> {
  checkBuildSecrets(config.build, deps.env.variables);
  if (config.imageStore !== null) {
    const host = registryHost(config.imageStore.repository);
    try {
      await deps.hostDocker.checkLogin(host);
    } catch (error) {
      if (error instanceof DockerLoginError) throw new ImageStoreLoginError(config.imageStore.repository, host, error.message);
      throw error;
    }
  }
  await deps.runStore.check();
}
