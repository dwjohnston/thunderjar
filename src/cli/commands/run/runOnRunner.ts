// Runner mode, on the old path: with `runtime.runner` in the config, `run` has the runtime build
// and store the images, submits the execution to a runner there, and follows it. Everything else
// `run` does is src/runNext/. Not yet moved onto it: the runner itself still runs `runExecution`.
import { ConfigError, findThunderjarRoot } from "../../../config/loader.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../../config/projectConfig.ts";
import type { Overrides } from "../../../config/overrides.ts";
import { checkRequiredEnv } from "../../../config/requiredEnv.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { DockerUnavailableError } from "../../../docker/docker.ts";
import { checkImageStore, ImageStoreLoginError } from "../../../execution/imageStore.ts";
import { storePrerunImages, submissionEnv, submitExecution } from "../../../execution/onRuntime.ts";
import { planExecution } from "../../../execution/planExecution.ts";
import { removeExecutionContainers, runExecution, runsConcurrently } from "../../../execution/runExecution.ts";
import { storeRunnerImage } from "../../../execution/runnerImage.ts";
import { planData, type Submission } from "../../../execution/runnerSpec.ts";
import { type RunFacts, runRuntimeHook, RuntimeHookError } from "../../../execution/runtimeHooks.ts";
import { timings } from "../../../execution/timings.ts";
import { ulid } from "../../../execution/ulid.ts";
import { RunDataStoreError } from "../../../store/runDataStore.ts";
import { painter } from "../../colour.ts";
import { displayPath, type OpenStore, openStore } from "../../dataDir.ts";
import { print, printError as error, printJson, printWarning } from "../../output.ts";
import { detachedMessage, type Executed, followToEnd, mergeTimings, reportRunnerFailure } from "./followRunner.ts";
import { runDisplay, showSecrets, showTimings, showUnclean, showUnsearched, storeFailure } from "./runDisplay.ts";

/** How long an interrupted `run` waits for its execution to be recorded as failed, before it runs afterExecution. */
const INTERRUPT_SETTLE_MS = 15_000;

/**
 * Runs test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above it: builds its
 * missing prerun images, then runs each iteration in a container, writing a line for each as it
 * finishes, and one of its measures once they're taken, and records them in the run data store
 * the config names, or the one in `dataDir`. With an image store, pushes each prerun image once built, and each postrun
 * image once its container run is recorded, writing `Pushing <reference> ... done`. Exits 1 if
 * any agent exits non-zero or times out, or with an error if Docker fails, or, before anything is
 * built, if a variable a harness needs is unset or Docker has no login for the image store.
 *
 * Runs `concurrency` containers at once, or the runtime's, or one at a time, and builds the config's
 * build concurrency of prerun images at once. With more than one of either, each iteration starts
 * as soon as its prerun image is ready, and each line is written whole, starting with its
 * iteration or prerun image, as they finish in any order. On a terminal, each iteration and each
 * prerun image has one line instead, rewritten in place as it goes, with how long its current
 * step has taken counting up.
 *
 * Each list `overrides` gives, or its iterations, replaces the test case's own.
 *
 * With `json`, once the execution is recorded, prints it as JSON, with where it's recorded and each
 * of its container runs' records, whether it's complete or failed. If it stops on an error, prints
 * nothing on stdout.
 */
export async function runOnRunner(
  cwd: string,
  name: string,
  imagePrefix: string,
  dataDir?: string,
  concurrencyOption?: number,
  overrides: Overrides = {},
  json = false,
  showsTimings = false,
): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const config = await loadProjectConfig(root);
  for (const deprecation of config.deprecations) printWarning(deprecation);
  const { imageStore, build } = config;
  const { runtime } = config;
  // With a runner, the whole execution runs on the runtime, and this only submits and follows it.
  const runner = runtime?.runner;
  if (runner !== undefined && dataDir !== undefined) {
    throw new ConfigError("--data-dir can't be used with a runtime's runner: the runner records the execution, in the config's runDataStore.");
  }
  const concurrency = concurrencyOption ?? runtime?.concurrency ?? 1;
  const concurrent = runsConcurrently(concurrency, build);
  const testCase = await loadTestCase(root, name, overrides);
  await checkRequiredEnv(root, testCase);
  checkBuildSecrets(build);
  try {
    await checkImageStore(imageStore);
  } catch (caught) {
    if (caught instanceof ImageStoreLoginError) {
      error(caught.message);
    } else if (caught instanceof DockerUnavailableError) {
      error(`Docker can't be reached, so nothing can be run: ${caught.message}`);
    } else {
      throw caught;
    }
    process.exitCode = 1;
    return;
  }
  const plan = await planExecution(root, testCase, ulid(), imagePrefix);
  // The variables the runner is sent: any that's unset is found out here, before anything is built.
  const runnerEnv = runner === undefined ? undefined : submissionEnv(plan, config.runDataStore, runner);
  // The runner opens the store, on the runtime: this needn't reach it.
  const opened = runner === undefined ? await openStore(cwd, dataDir, root) : undefined;
  // Before anything is built or started: otherwise it's found out as the first container run is recorded.
  try {
    await opened?.store.check();
  } catch (caught) {
    if (!(caught instanceof RunDataStoreError)) throw caught;
    error(storeFailure(cwd, caught, "so nothing was run"));
    process.exitCode = 1;
    return;
  }
  // Colour for what's written while running, on a terminal.
  const paint = painter();
  const ellipsis = paint.dim("...");
  const done = paint.green("done");
  const display = runDisplay({ testCase, permutations: plan.permutations.length, concurrent, stored: imageStore !== null, remote: runtime !== null, paint });
  const { open, close, fail } = display;

  print(`${paint.dim("Execution")} ${paint.bold(plan.executionId)}`);
  if (runtime !== null && runner === undefined) print(paint.dim(`Running containers with \`${runtime.command.join(" ")}\``));
  if (runtime !== null && runner !== undefined) print(paint.dim(`Running the execution on the runtime, in a runner started with \`${runtime.command.join(" ")}\``));
  if (concurrency > 1) print(paint.dim(`Up to ${concurrency} containers at once`));
  if (build.concurrency > 1) print(paint.dim(`Building up to ${build.concurrency} prerun images at once`));
  const facts: RunFacts = {
    executionId: plan.executionId,
    concurrency,
    containers: plan.permutations.reduce((sum, permutation) => sum + permutation.iterations.length, 0),
  };
  /** Runs the runtime's `hook`, if it has one, on a line of its own. False, with the error written, if it fails. */
  const runHook = async (hook: "beforeExecution" | "afterExecution"): Promise<boolean> => {
    const command = runtime?.[hook];
    if (command === undefined) return true;
    open(`Running the runtime's ${hook}, ${paint.cyan(`\`${command.join(" ")}\``)} ${ellipsis} `);
    try {
      await runRuntimeHook(hook, command, facts);
      close(done);
      return true;
    } catch (caught) {
      if (!(caught instanceof RuntimeHookError)) throw caught;
      fail();
      error(`The runtime's ${hook} failed: ${caught.message}`);
      process.exitCode = 1;
      return false;
    }
  };
  if (!(await runHook("beforeExecution"))) return;
  // Ctrl-C, or a cancelled CI job: without this, its containers would keep running, their agents
  // still spending, and a runtime started by beforeExecution would never be released by afterExecution.
  let interrupted = false;
  let executing: Promise<Executed> | undefined;
  // Once the execution is a runner's, on the runtime: it's left to carry on, and only followed.
  let submitted = false;
  const following = new AbortController();
  const interrupt = (signal: "SIGINT" | "SIGTERM") => {
    if (interrupted) return;
    interrupted = true;
    void (async () => {
      display.stop();
      if (submitted) {
        following.abort();
        error(detachedMessage(signal, plan.executionId));
        process.exit(signal === "SIGINT" ? 130 : 143);
      }
      error(`Interrupted (${signal}): stopping execution ${plan.executionId}'s containers${runtime === null ? "" : " on the runtime"}.`);
      try {
        await removeExecutionContainers(plan.executionId, imagePrefix, runtime);
      } catch (caught) {
        error(`Couldn't remove its containers: ${caught instanceof Error ? caught.message : String(caught)}`);
      }
      // Its container runs fail, now their containers are gone: once they have, the execution is recorded as failed.
      await Promise.race([executing?.catch(() => {}), Bun.sleep(INTERRUPT_SETTLE_MS)]);
      await runHook("afterExecution");
      process.exit(signal === "SIGINT" ? 130 : 143);
    })();
  };
  const onInt = () => interrupt("SIGINT");
  const onTerm = () => interrupt("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  // What this does itself, with a runner: have the runtime build and push the images. The runner times the rest.
  const hostTimer = timings();
  /** The execution, run here: each Docker command given to the local daemon, or the runtime. */
  const executeHere = async ({ store, where }: OpenStore): Promise<Executed> => {
    const execution = await runExecution({ root, name, testCase, overrides, plan, imagePrefix, imageStore, build, runtime, concurrency }, store, display.hooks);
    return { execution, recordedIn: where, containerRuns: json ? await store.containerRunsOf(execution.executionId) : [] };
  };
  /** The execution, run by a runner on the runtime: its images stored, then submitted and followed. */
  const executeOnRuntime = async (command: string[], options: NonNullable<typeof runner>, env: Record<string, string>): Promise<Executed> => {
    const store = imageStore as NonNullable<typeof imageStore>;
    const runnerImage = await storeRunnerImage(root, store.repository, command, {
      onBuilding: (image) => open(`Building the runner image ${paint.cyan(image)} ${ellipsis} `),
      onBuilt: () => close(done),
      onPushing: (_image, reference) => open(`Pushing ${paint.cyan(reference)} ${ellipsis} `),
      onPushed: () => close(done),
    });
    await storePrerunImages(root, plan, imagePrefix, store, command, build, display.hooks, hostTimer.time);
    const submission: Submission = {
      name,
      testCase,
      overrides,
      plan: planData(plan),
      concurrency,
      imagePrefix,
      imageStore: store,
      runDataStore: config.runDataStore,
      ...(options.registryLogin !== undefined && { registryLogin: options.registryLogin }),
      env,
    };
    await submitExecution(command, runnerImage, submission, options.runOptions);
    submitted = true;
    return followToEnd(command, plan.executionId, imagePrefix, root, () => ({ hooks: display.hooks, plan: submission.plan }), following.signal);
  };
  try {
    executing = opened !== undefined ? executeHere(opened) : executeOnRuntime((runtime as NonNullable<typeof runtime>).command, runner as NonNullable<typeof runner>, runnerEnv as Record<string, string>);
    const { execution: record, recordedIn: where, containerRuns } = await executing;
    display.stop();
    for (const line of showUnclean(display.unclean, facts.containers, paint)) print(line);
    for (const line of showSecrets(display.secrets, facts.containers, paint)) print(line);
    for (const line of showUnsearched(display.unsearched, facts.containers, paint)) print(line);
    print(paint.dim(`Recorded in ${displayPath(cwd, where)}`));
    if (json) printJson({ execution: record, recordedIn: where, containerRuns });
    if (record.status === "failed") process.exitCode = 1;
  } catch (caught) {
    // Its containers were removed under it, or it was left to its runner: `interrupt` says so, and ends the process.
    if (interrupted) return await new Promise<never>(() => {});
    if (!display.reportFailure(caught, cwd) && !reportRunnerFailure(caught, plan.executionId)) throw caught;
    process.exitCode = 1;
  } finally {
    display.stop();
    // `interrupt` runs afterExecution itself, and ends the process.
    if (interrupted) await new Promise<never>(() => {});
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    // So a runtime started for the execution is released, however it ended. None with a runner.
    await runHook("afterExecution");
    const spent = mergeTimings(hostTimer.summary(), display.timings(), runner !== undefined);
    if (showsTimings && spent !== undefined) print(showTimings(spent));
  }
}
