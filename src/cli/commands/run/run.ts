import { Command, InvalidArgumentError, Option } from "commander";
import { RUN_SCRIPT_PATH } from "../../../api/files.ts";
import { ConfigError, FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { AXES } from "../../../config/permutations.ts";
import { checkBuildSecrets, isConcurrency, loadProjectConfig } from "../../../config/projectConfig.ts";
import { givenOverrides, type Overrides } from "../../../config/overrides.ts";
import { checkRequiredEnv } from "../../../config/requiredEnv.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { DockerUnavailableError } from "../../../docker/docker.ts";
import { checkImageStore, ImageStoreLoginError } from "../../../execution/imageStore.ts";
import { storePrerunImages, submissionEnv, submitExecution } from "../../../execution/onRuntime.ts";
import { type PlannedExecution, planExecution } from "../../../execution/planExecution.ts";
import { removeExecutionContainers, runExecution, runsConcurrently } from "../../../execution/runExecution.ts";
import { storeRunnerImage } from "../../../execution/runnerImage.ts";
import { planData, type Submission } from "../../../execution/runnerSpec.ts";
import { type RunFacts, runRuntimeHook, RuntimeHookError } from "../../../execution/runtimeHooks.ts";
import { timings } from "../../../execution/timings.ts";
import { ulid } from "../../../execution/ulid.ts";
import { RunDataStoreError } from "../../../store/runDataStore.ts";
import { type Paint, painter, plain } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, displayPath, type OpenStore, openStore } from "../../dataDir.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { envEntry } from "../../format.ts";
import { jsonOption } from "../../json.ts";
import { overridesOf, withOverrideOptions } from "../../overrides.ts";
import { print, printError as error, printJson, printWarning } from "../../output.ts";
import { detachedMessage, type Executed, followToEnd, mergeTimings, reportRunnerFailure } from "./followRunner.ts";
import { runDisplay, showSecrets, showTimings, showUnclean, showUnsearched, storeFailure } from "./runDisplay.ts";
import type { Services } from "../../services.ts";
import { runCommand } from "../../../runNext/runCommand/runCommand.ts";
import type { Dependencies } from "../../../runNext/types.ts";

/** How far a dry run's iteration fields are indented, and how wide their labels are. */
const FIELD_INDENT = "    ";
const LABEL_WIDTH = 10;

/** `label: value`, the value's later lines lined up under its first. */
const field = (label: string, value: string, paint: Paint = plain) =>
  `${FIELD_INDENT}${paint.dim(`${label}:`.padEnd(LABEL_WIDTH))}${value.split("\n").join(`\n${FIELD_INDENT}${" ".repeat(LABEL_WIDTH)}`)}`;

/**
 * The environment variables a permutation's containers are given: by name, its harness's, then its
 * test case's `secretEnv`, whose values come from the shell, and, as `NAME=value`, its test case's `env`.
 */
const envShown = ({ env, secretEnv, testCaseEnv }: PlannedExecution["permutations"][number]): string[] => [
  ...new Set([...env, ...secretEnv]),
  ...Object.entries(testCaseEnv).map(([name, value]) => envEntry(name, value)),
];

/**
 * The execution's ID, then each permutation's prerun image, with each iteration's postrun image,
 * the environment variables its container is given, by name, or with their values for the test
 * case's `env`, any more `docker run` options, and
 * the command it runs: its prerun image's run script. `build --dry-run` shows what the script is.
 */
export function renderExecution({ executionId, permutations }: PlannedExecution, paint: Paint = plain): string {
  const f = (label: string, value: string) => field(label, value, paint);
  const blocks = permutations.map((permutation) =>
    [
      `${paint.bold(`Permutation ${permutation.number}`)}: prerun image ${paint.cyan(permutation.prerunImage)}`,
      ...permutation.iterations.flatMap((iteration) => [
        `  ${paint.bold(`Iteration ${iteration.number}`)}: postrun image ${paint.cyan(iteration.postrunImage)}`,
        ...(envShown(permutation).length > 0 ? [f("env", envShown(permutation).join(", "))] : []),
        ...(permutation.runOptions.length > 0 ? [f("docker", permutation.runOptions.join(" "))] : []),
        f("command", `sh ${RUN_SCRIPT_PATH}`),
      ]),
    ].join("\n"),
  );
  return [`${paint.dim("Execution")} ${paint.bold(executionId)}`, ...blocks].join("\n\n");
}

/**
 * A dry run as `run --dry-run --json` prints it: what `renderExecution` shows, the overrides
 * given, and each permutation's parameters. Each permutation's `env` is its harness's variables'
 * names; its test case's are `testCaseEnv`, with their values, and `secretEnv`, names only.
 */
export function executionPlanJson({ executionId, permutations }: PlannedExecution, overrides: Overrides = {}) {
  return {
    executionId,
    overrides: givenOverrides(overrides),
    permutations: permutations.map(({ number, permutation, prerunImage, env, testCaseEnv, secretEnv, runOptions, timeoutSeconds, version, iterations }) => ({
      number,
      parameters: Object.fromEntries(AXES.map((axis) => [axis, permutation[axis]])) as Record<(typeof AXES)[number], string>,
      modelId: permutation.modelId,
      harnessVersion: version,
      hash: permutation.hash,
      prerunImage,
      env,
      testCaseEnv,
      secretEnv,
      runOptions,
      timeoutSeconds,
      // Each iteration runs its prerun image's run script. `build --dry-run` shows what the script is.
      iterations: iterations.map(({ number, postrunImage }) => ({ number, postrunImage, command: `sh ${RUN_SCRIPT_PATH}` })),
    })),
  };
}

/**
 * What an execution of test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above it,
 * would do, each list `overrides` gives in place of its own.
 */
export async function planDryRun(cwd: string, name: string, imagePrefix?: string, overrides: Overrides = {}): Promise<PlannedExecution> {
  const root = await findThunderjarRoot(cwd);
  const executionId = ulid();
  const testCase = await loadTestCase(root, name, overrides);
  await checkRequiredEnv(root, testCase);
  return planExecution(root, testCase, executionId, imagePrefix);
}

/** What an execution of test case `name` would do, as text. See `planDryRun`. */
export async function dryRun(cwd: string, name: string, imagePrefix?: string, overrides: Overrides = {}, paint: Paint = plain): Promise<string> {
  return renderExecution(await planDryRun(cwd, name, imagePrefix, overrides), paint);
}

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
async function run(
  _services: Services,
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

/** The services `runNext` uses, picked from those src/cli/index.ts built, with `--concurrency` in place of the settings' own. */
function dependencies(services: Services, concurrency?: number): Dependencies {
  const { io, runSettings, runDataStore, ...rest } = services;
  return {
    ...rest,
    settings: { ...runSettings, ...(concurrency !== undefined && { concurrency }) },
    runStore: runDataStore,
    stdout: io.stdout,
    stderr: io.stderr,
    onStop: (handler) => io.onStop(handler),
  };
}

/** Whether the config of the project in `cwd` has executions run by a runner on its runtime. */
async function hasRunner(cwd: string): Promise<boolean> {
  return (await loadProjectConfig(await findThunderjarRoot(cwd))).runtime?.runner !== undefined;
}

type Options = Overrides & { dryRun?: boolean; buildOnly?: boolean; concurrency?: number; imagePrefix: string; dataDir?: string; json?: boolean; timings?: boolean };

export function createRunCommand(services: Services): Command {
  return withOverrideOptions(new Command("run"))
    .description(
      "Run a test case: one execution, with a new ID. Builds any missing prerun image, then runs each iteration of each permutation in a container from its prerun image, commits it into its postrun image, takes the task's measurements of it, each in a container from its postrun image, and records it in the run data store. With an image store in thunderjar.config.ts, checks your docker login for its registry first, and pushes each prerun and postrun image there. With a runtime in thunderjar.config.ts, builds the prerun images on it and runs the containers there, from the image store, up to its concurrency at once, or --concurrency. Builds up to the config's build concurrency of prerun images at once. Every prerun image is ready before the first container starts. --iterations overrides the test case's iterations.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option(
      "--dry-run",
      "print the images, environment variables and commands the execution would use, without running anything",
    )
    .option("--build-only", "build the missing prerun images, and push them to the image store if there's one, without running anything")
    .addOption(
      new Option("--concurrency <n>", "run up to <n> containers at once, instead of the runtime's concurrency, or one at a time").argParser((value: string) => {
        const n = Number(value);
        if (!/^\d+$/.test(value) || !isConcurrency(n)) throw new InvalidArgumentError("It must be a whole number, 1 or more.");
        return n;
      }),
    )
    .option("--timings", "once the execution ends, print how long each of its phases took: builds, pushes, pulls, agents, commits and measuring")
    .addOption(imagePrefixOption())
    .addOption(dataDirOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (name: string, options: Options) => {
        const overrides = overridesOf(options);
        const { cwd } = services.env;
        // A runtime's runner runs the whole execution there: still the old path, which only submits and follows it.
        if (!options.dryRun && !options.buildOnly && (await hasRunner(cwd))) {
          return run(services, cwd, name, options.imagePrefix, options.dataDir, options.concurrency, overrides, options.json, options.timings);
        }
        const { dryRun, buildOnly, json, imagePrefix } = options;
        const { exitCode } = await runCommand(name, { ...givenOverrides(overrides), dryRun, buildOnly, json, imagePrefix }, dependencies(services, options.concurrency));
        if (exitCode !== 0) process.exitCode = exitCode;
      }),
    );
}
