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
import { storeFailure } from "../../cli/commands/run/runDisplay.ts";
import { pushFailure } from "../../cli/format.ts";
import { ConfigError, findThunderjarRoot, type Problem, problemsError } from "../../config/loader.ts";
import { loadMeasurements } from "../../config/measurements.ts";
import type { Overrides } from "../../config/overrides.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../config/projectConfig.ts";
import { checkRequiredEnv, requiredEnvOf } from "../../config/requiredEnv.ts";
import { loadTestCase } from "../../config/testCase.ts";
import { envOf, secretEnvOf } from "../../config/testCaseEnv.ts";
import { DockerBuildError, DockerContainerError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../docker/docker.ts";
import { hashPermutations } from "../../execution/hashPermutations.ts";
import { DEFAULT_IMAGE_PREFIX, executionContainerPrefix } from "../../execution/images.ts";
import { ImageStoreLoginError } from "../../execution/imageStore.ts";
import { type Loaded, loadHarness } from "../../execution/planExecution.ts";
import { moduleLogger } from "../../log/logger.ts";
import type { StopSignal } from "../../services/Io/Io.ts";
import { RunDataStoreError } from "../../services/RunDataStore/RunDataStore.ts";
import { RuntimeHookError } from "../../services/RuntimeHooks/RuntimeHooks.ts";
import { runTestCase } from "../runTestCase/runTestCase.ts";
import { changeRunDetails, logEvent } from "../state/state.ts";
import type { Dependencies, OutputFormat, RunMode, RunOptions, RunRecord, TestCaseConfig } from "../types.ts";

const log = moduleLogger("execution");

/** What a run came to: its records, if it ran, and the code the process should exit with. */
export type RunResult = { records?: RunRecord[]; exitCode: number };

/**
 * What to say about `error`, if it's one an execution stops on, or undefined for any other, which
 * is thrown on. `ran` is whether the execution got as far as having a manifest.
 */
function failureMessage(error: unknown, cwd: string, ran: boolean): string | undefined {
  if (error instanceof ImageStoreLoginError) return error.message;
  if (error instanceof DockerUnavailableError) return `Docker can't be reached, so nothing can be run: ${error.message}`;
  if (error instanceof DockerBuildError) return `Building ${error.image} failed: ${error.message}`;
  if (error instanceof DockerPushError) return pushFailure(error.reference, error);
  if (error instanceof DockerPullError) {
    return `The runtime couldn't pull ${error.reference}: ${error.message}\nMake sure it can reach the image store's registry and is logged in to it. \`thunderjar doctor\` checks this.`;
  }
  if (error instanceof RunDataStoreError) return storeFailure(cwd, error, ran ? "so the execution stopped" : "so nothing was run");
  if (error instanceof DockerContainerError) return `Running a container failed: ${error.message}`;
  if (error instanceof RuntimeHookError) return `The runtime's ${error.hook} failed: ${error.message}`;
  return undefined;
}

/**
 * Runs the test case, showing it through the displayer. A ConfigError is thrown on, for the
 * command to report. An error an execution stops on, e.g. a failed build, is written to stderr,
 * with exit code 1. The exit code is 1 too if the execution is recorded as failed, and 130 or 143
 * if it was asked to stop: then no more runs start, its containers are removed, and it's recorded
 * as failed.
 */
export async function runCommand(testCaseName: string, options: RunOptions, deps: Dependencies): Promise<RunResult> {
  const { overrides, mode, output } = splitOptions(options);
  const { displayer } = deps;
  let stopped: StopSignal | undefined;
  // Awaited before the command returns, so the process doesn't end with its containers still there.
  let removing: Promise<void> | undefined;
  const offStop = deps.onStop((signal) => {
    if (stopped !== undefined) return;
    stopped = signal;
    const manifest = deps.state.get().run.manifest;
    deps.stderr.write(`Error: Interrupted (${signal}): stopping${manifest === undefined ? "" : ` execution ${manifest.executionId}'s containers${manifest.config.runtime === null ? "" : " on the runtime"}`}.\n`);
    logEvent(deps, { type: "stopping", signal });
    changeRunDetails(deps, (details) => ({ ...details, stopRequested: signal }));
    // Its container runs end as crashed, now their containers are gone, and the execution is recorded as failed.
    if (manifest !== undefined) {
      removing = deps.runtimeDocker.removeContainersNamed(executionContainerPrefix(manifest.executionId, manifest.config.imagePrefix)).then(
        (removed) => log.warn({ executionId: manifest.executionId, removed }, "execution interrupted: removed its containers"),
        (error: unknown) => deps.stderr.write(`Error: Couldn't remove its containers: ${error instanceof Error ? error.message : String(error)}\n`),
      );
    }
  });

  displayer.setMode(output);
  displayer.start();
  let failure: { error: unknown } | undefined;
  let records: RunRecord[] | undefined;
  try {
    const testCaseConfig = await resolveTestCase(testCaseName, { ...overrides, imagePrefix: options.imagePrefix }, deps);
    for (const deprecation of testCaseConfig.deprecations) deps.stderr.write(`Warning: ${deprecation}\n`);
    records = await runTestCase(testCaseConfig, deps, mode);
  } catch (error) {
    failure = { error };
  } finally {
    await removing;
    offStop();
    displayer.stop(); // interactive: final frame; json: write the result to stdout
  }
  const signalCode = stopped === undefined ? undefined : stopped === "SIGINT" ? 130 : 143;
  if (failure !== undefined) {
    const ran = deps.state.get().run.manifest !== undefined;
    // An execution and its afterExecution can both fail: each is said, in the order they failed.
    const errors: unknown[] = failure.error instanceof AggregateError ? failure.error.errors : [failure.error];
    const said = errors.map((error) => failureMessage(error, deps.env.cwd, ran));
    const unknown = errors.find((_, i) => said[i] === undefined);
    if (unknown !== undefined) throw unknown;
    log.error({ err: failure.error }, "execution failed");
    for (const message of said) deps.stderr.write(`Error: ${message}\n`);
    return { exitCode: signalCode ?? 1 };
  }
  const failed = deps.state.get().run.details?.finished?.execution.status === "failed";
  return { ...(records !== undefined && { records }), exitCode: signalCode ?? (failed ? 1 : 0) };
}

/** Overrides go into the config, the mode goes to level 2, the output format only to the displayer. */
export function splitOptions(options: RunOptions): { overrides: Overrides; mode: RunMode; output: OutputFormat } {
  const { dryRun, buildOnly, json, imagePrefix: _imagePrefix, ...overrides } = options;
  if (dryRun && buildOnly) throw new ConfigError("--dry-run and --build-only can't be used together.");
  return {
    overrides,
    mode: dryRun ? "dry-run" : buildOnly ? "build-only" : "full",
    output: json ? "json" : "interactive",
  };
}

/**
 * Finds the test case on the filesystem and applies the overrides. Everything `plan` needs is
 * read here: the project's config, each permutation's hashes and Dockerfile, its harness, and the
 * task's measurements. Throws a ConfigError if any is wrong, or if a variable a harness, the test
 * case or a build secret needs is unset, so nothing is built first.
 */
export async function resolveTestCase(
  testCaseName: string,
  overrides: Overrides & { imagePrefix?: string },
  deps: Pick<Dependencies, "env" | "fs">,
): Promise<TestCaseConfig & { deprecations: string[] }> {
  const { imagePrefix = DEFAULT_IMAGE_PREFIX, ...given } = overrides;
  const { variables } = deps.env;
  const root = await findThunderjarRoot(deps.env.cwd);
  const config = await loadProjectConfig(root);
  const testCase = await loadTestCase(root, testCaseName, given);
  await checkRequiredEnv(root, testCase, variables);
  checkBuildSecrets(config.build, variables);
  const hashed = await hashPermutations(root, testCase);
  const problems: Problem[] = [];
  const loaded = await Promise.all(hashed.map((permutation) => loadHarness(root, testCase.task, permutation, problems)));
  if (problems.length > 0) throw problemsError(problems);
  const measurements = await loadMeasurements(root, testCase.task);
  return {
    ...testCase,
    name: testCaseName,
    root,
    overrides: given,
    imagePrefix,
    imageStore: config.imageStore,
    build: config.build,
    runtime:
      config.runtime === null
        ? null
        : {
            command: config.runtime.command,
            ...(config.runtime.beforeExecution !== undefined && { beforeExecution: config.runtime.beforeExecution }),
            ...(config.runtime.afterExecution !== undefined && { afterExecution: config.runtime.afterExecution }),
          },
    permutations: hashed.map((permutation, p) => {
      const harnessed = loaded[p] as Loaded;
      return {
        hashed: permutation,
        env: requiredEnvOf(harnessed.harness, variables),
        runOptions: harnessed.baseImage.runOptions ?? [],
        timeoutSeconds: harnessed.initialPrompt.timeoutSeconds,
        harness: harnessed.harness,
        collectTokenCosts: harnessed.collectTokenCosts,
        version: harnessed.version,
      };
    }),
    measurements,
    testCaseEnv: envOf(testCase),
    secretEnv: secretEnvOf(testCase),
    deprecations: config.deprecations,
  };
}
