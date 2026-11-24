import { Command, InvalidArgumentError, Option } from "commander";
import { RUN_SCRIPT_PATH } from "../../../api/files.ts";
import { ConfigError, FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { AXES } from "../../../config/permutations.ts";
import { checkBuildSecrets, isConcurrency, loadProjectConfig } from "../../../config/projectConfig.ts";
import { givenOverrides, type Overrides } from "../../../config/overrides.ts";
import { checkRequiredEnv } from "../../../config/requiredEnv.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { DockerUnavailableError, startTimeoutSeconds } from "../../../docker/docker.ts";
import type { Ids } from "../../../execution/ids.ts";
import { checkImageStore, ImageStoreLoginError } from "../../../execution/imageStore.ts";
import { storePrerunImages, submissionEnv, submitExecution } from "../../../execution/onRuntime.ts";
import { type PlannedExecution, planExecution } from "../../../execution/planExecution.ts";
import { removeExecutionContainers, runExecution, runsConcurrently } from "../../../execution/runExecution.ts";
import { storeRunnerImage } from "../../../execution/runnerImage.ts";
import { planData, type Submission } from "../../../execution/runnerSpec.ts";
import { type RunFacts, runRuntimeHook, RuntimeHookError } from "../../../execution/runtimeHooks.ts";
import { timings } from "../../../execution/timings.ts";
import type { StopSignal } from "../../../io/io.ts";
import { RunDataStoreError } from "../../../store/runDataStore.ts";
import type { CommandRun, Env } from "../../app.ts";
import { type Paint, plain } from "../../colour.ts";
import { exitCodeOf } from "../../configErrors.ts";
import { dataDirOption, displayPath, type OpenStore, openStore } from "../../dataDir.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { envEntry } from "../../format.ts";
import { jsonOption } from "../../json.ts";
import { overridesOf, withOverrideOptions } from "../../overrides.ts";
import { type Printer, printer } from "../../output.ts";
import { detachedMessage, type Executed, followToEnd, mergeTimings, reportRunnerFailure } from "./followRunner.ts";
import { runDisplay, showSecrets, showTimings, showUnclean, showUnsearched, storeFailure } from "./runDisplay.ts";

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
 * would do, each list `overrides` gives in place of its own, with its ID from `ids`. `env` is the
 * environment its harnesses' variables are looked for in.
 */
export async function planDryRun(cwd: string, name: string, ids: Ids, env: Env, imagePrefix?: string, overrides: Overrides = {}): Promise<PlannedExecution> {
  const root = await findThunderjarRoot(cwd);
  const executionId = ids.executionId();
  const testCase = await loadTestCase(root, name, overrides);
  await checkRequiredEnv(root, testCase, env);
  return planExecution(root, testCase, executionId, imagePrefix);
}

/** What an execution of test case `name` would do, as text. See `planDryRun`. */
export async function dryRun(cwd: string, name: string, ids: Ids, env: Env, imagePrefix?: string, overrides: Overrides = {}, paint: Paint = plain): Promise<string> {
  return renderExecution(await planDryRun(cwd, name, ids, env, imagePrefix, overrides), paint);
}

/** How long an interrupted `run` waits for its execution to be recorded as failed, before it runs afterExecution. */
const INTERRUPT_SETTLE_MS = 15_000;

type RunArgs = {
  name: string;
  imagePrefix: string;
  dataDir?: string;
  local: boolean;
  concurrency?: number;
  overrides: Overrides;
  json: boolean;
  timings: boolean;
};

/**
 * Runs test case `name`, of the nearest `.thunderjar/` folder in `ctx`'s cwd or above it: builds its
 * missing prerun images, then runs each iteration in a container, writing a line for each as it
 * finishes, and one of its measures once they're taken, and records them in the run data store
 * the config names, or the one in `dataDir`. With an image store, pushes each prerun image once built, and each postrun
 * image once its container run is recorded, writing `Pushing <reference> ... done`. Returns 1 if
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
 *
 * Asked to stop, by Ctrl-C (SIGINT) or SIGTERM, it removes the execution's containers, waits for
 * it to be recorded as failed, runs afterExecution, and returns 130 or 143: src/cli/index.ts then
 * ends the process at once. Following a runner, it leaves the execution to it.
 */
async function run(ctx: CommandRun, out: Printer, { name, imagePrefix, dataDir, local, concurrency: concurrencyOption, overrides, json, timings: showsTimings }: RunArgs): Promise<number> {
  const { clock, launch } = ctx;
  const { cwd } = launch;
  const root = await findThunderjarRoot(cwd);
  const config = await loadProjectConfig(root);
  for (const deprecation of config.deprecations) out.printWarning(deprecation);
  const { imageStore, build } = config;
  const runtime = local ? null : config.runtime;
  // With a runner, the whole execution runs on the runtime, and this only submits and follows it.
  const runner = runtime?.runner;
  if (runner !== undefined && dataDir !== undefined) {
    throw new ConfigError("--data-dir can't be used with a runtime's runner: the runner records the execution, in the config's runDataStore. Pass --local to run here.");
  }
  const concurrency = concurrencyOption ?? runtime?.concurrency ?? 1;
  const concurrent = runsConcurrently(concurrency, build);
  const testCase = await loadTestCase(root, name, overrides);
  await checkRequiredEnv(root, testCase, launch.env);
  checkBuildSecrets(build, launch.env);
  try {
    await checkImageStore(imageStore, ctx.docker);
  } catch (caught) {
    if (caught instanceof ImageStoreLoginError) {
      out.printError(caught.message);
    } else if (caught instanceof DockerUnavailableError) {
      out.printError(`Docker can't be reached, so nothing can be run: ${caught.message}`);
    } else {
      throw caught;
    }
    return 1;
  }
  const plan = await planExecution(root, testCase, ctx.ids.executionId(), imagePrefix);
  // The variables the runner is sent: any that's unset is found out here, before anything is built.
  const runnerEnv = runner === undefined ? undefined : submissionEnv(plan, config.runDataStore, runner);
  // The runner opens the store, on the runtime: this needn't reach it.
  const opened = runner === undefined ? await openStore(cwd, dataDir, root, launch.env) : undefined;
  // Before anything is built or started: otherwise it's found out as the first container run is recorded.
  try {
    await opened?.store.check();
  } catch (caught) {
    if (!(caught instanceof RunDataStoreError)) throw caught;
    out.printError(storeFailure(cwd, caught, "so nothing was run"));
    return 1;
  }
  // Colour for what's written while running, on a terminal.
  const { paint } = out;
  const ellipsis = paint.dim("...");
  const done = paint.green("done");
  const display = runDisplay({ testCase, permutations: plan.permutations.length, concurrent, stored: imageStore !== null, remote: runtime !== null, out, clock });
  const { open, close, fail } = display;

  out.print(`${paint.dim("Execution")} ${paint.bold(plan.executionId)}`);
  if (runtime !== null && runner === undefined) out.print(paint.dim(`Running containers with \`${runtime.command.join(" ")}\``));
  if (runtime !== null && runner !== undefined) out.print(paint.dim(`Running the execution on the runtime, in a runner started with \`${runtime.command.join(" ")}\``));
  if (concurrency > 1) out.print(paint.dim(`Up to ${concurrency} containers at once`));
  if (build.concurrency > 1) out.print(paint.dim(`Building up to ${build.concurrency} prerun images at once`));
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
      out.printError(`The runtime's ${hook} failed: ${caught.message}`);
      return false;
    }
  };
  if (!(await runHook("beforeExecution"))) {
    display.stop();
    return 1;
  }
  // Where its containers run: the local daemon, or the runtime's.
  const docker = runtime === null ? ctx.docker : ctx.docker.on(runtime.command);
  // Ctrl-C, or a cancelled CI job: without this, its containers would keep running, their agents
  // still spending, and a runtime started by beforeExecution would never be released by afterExecution.
  let interrupted = false;
  // Its exit code, once `interrupt` is done: 130 for SIGINT, 143 for SIGTERM.
  const interruption = Promise.withResolvers<number>();
  let executing: Promise<Executed> | undefined;
  // Once the execution is a runner's, on the runtime: it's left to carry on, and only followed.
  let submitted = false;
  const following = new AbortController();
  const interrupt = (signal: StopSignal) => {
    if (interrupted) return;
    interrupted = true;
    const code = signal === "SIGINT" ? 130 : 143;
    void (async () => {
      try {
        display.stop();
        if (submitted) {
          following.abort();
          out.printError(detachedMessage(signal, plan.executionId));
          return;
        }
        out.printError(`Interrupted (${signal}): stopping execution ${plan.executionId}'s containers${runtime === null ? "" : " on the runtime"}.`);
        try {
          await removeExecutionContainers(docker, plan.executionId, imagePrefix);
        } catch (caught) {
          out.printError(`Couldn't remove its containers: ${caught instanceof Error ? caught.message : String(caught)}`);
        }
        // Its container runs fail, now their containers are gone: once they have, the execution is recorded as failed.
        const settled = new AbortController();
        await Promise.race([executing?.catch(() => {}), clock.sleep(INTERRUPT_SETTLE_MS, { signal: settled.signal }).catch(() => {})]);
        settled.abort();
        await runHook("afterExecution");
      } finally {
        interruption.resolve(code);
      }
    })();
  };
  const stopListening = ctx.io.onStop(interrupt);
  // What this does itself, with a runner: have the runtime build and push the images. The runner times the rest.
  const hostTimer = timings(() => clock.now());
  /** The execution, run here: each Docker command given to the local daemon, or the runtime. */
  const executeHere = async ({ store, where }: OpenStore): Promise<Executed> => {
    const execution = await runExecution({ root, name, testCase, overrides, plan, imagePrefix, imageStore, build, runtime, concurrency }, store, display.hooks, {
      docker: ctx.docker,
      clock,
      startSeconds: startTimeoutSeconds(launch.env),
    });
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
  let exitCode = 0;
  try {
    executing = opened !== undefined ? executeHere(opened) : executeOnRuntime((runtime as NonNullable<typeof runtime>).command, runner as NonNullable<typeof runner>, runnerEnv as Record<string, string>);
    // Interrupted while following a runner, it never ends: `interrupt` says so, and is done.
    const ended = await Promise.race([executing, interruption.promise.then(() => undefined)]);
    if (ended !== undefined && !interrupted) {
      const { execution: record, recordedIn: where, containerRuns } = ended;
      display.stop();
      for (const line of showUnclean(display.unclean, facts.containers, paint)) out.print(line);
      for (const line of showSecrets(display.secrets, facts.containers, paint)) out.print(line);
      for (const line of showUnsearched(display.unsearched, facts.containers, paint)) out.print(line);
      out.print(paint.dim(`Recorded in ${displayPath(cwd, where)}`));
      if (json) out.printJson({ execution: record, recordedIn: where, containerRuns });
      if (record.status === "failed") exitCode = 1;
    }
  } catch (caught) {
    // Its containers were removed under it: `interrupt` says so, and is done.
    if (!interrupted) {
      if (!display.reportFailure(caught, cwd) && !reportRunnerFailure(caught, plan.executionId)) throw caught;
      exitCode = 1;
    }
  } finally {
    display.stop();
    // `interrupt` runs afterExecution itself.
    if (!interrupted) {
      stopListening();
      // So a runtime started for the execution is released, however it ended. None with a runner.
      if (!(await runHook("afterExecution"))) exitCode = 1;
      const spent = mergeTimings(hostTimer.summary(), display.timings(), runner !== undefined);
      if (showsTimings && spent !== undefined) out.print(showTimings(spent));
    }
  }
  return interrupted ? await interruption.promise : exitCode;
}

/** `run`, running with `ctx`'s services. Without `ctx`, it only describes itself, e.g. for the docs. */
export function createRunCommand(ctx?: CommandRun): Command {
  return withOverrideOptions(new Command("run"))
    .description(
      "Run a test case: one execution, with a new ID. Builds any missing prerun image, then runs each iteration of each permutation in a container from its prerun image, commits it into its postrun image, takes the task's measurements of it, each in a container from its postrun image, and records it in the run data store. With an image store in thunderjar.config.ts, checks your docker login for its registry first, and pushes each prerun and postrun image there. With a runtime in thunderjar.config.ts, builds the prerun images on it and runs the containers there, from the image store, unless --local is given, and up to its concurrency at once, or --concurrency. Builds up to the config's build concurrency of prerun images at once. With more than one of either, each iteration starts as soon as its own prerun image is ready. --iterations overrides the test case's iterations.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option(
      "--dry-run",
      "print the images, environment variables and commands the execution would use, without running anything",
    )
    .option("--local", "build images and run containers on the local Docker daemon, even if thunderjar.config.ts gives a runtime")
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
      async (
        name: string,
        options: Overrides & { dryRun?: boolean; local?: boolean; concurrency?: number; imagePrefix: string; dataDir?: string; json?: boolean; timings?: boolean },
      ) => {
        if (ctx === undefined) throw new Error("run runs through createApp, with its services.");
        const out = printer(ctx.io, { json: options.json, env: ctx.launch.env });
        const { cwd, env } = ctx.launch;
        const overrides = overridesOf(options);
        ctx.exitCode = await exitCodeOf(out, async () => {
          if (options.dryRun && options.json) out.printJson(executionPlanJson(await planDryRun(cwd, name, ctx.ids, env, options.imagePrefix, overrides), overrides));
          else if (options.dryRun) out.print(await dryRun(cwd, name, ctx.ids, env, options.imagePrefix, overrides, out.paint));
          else {
            return run(ctx, out, {
              name,
              imagePrefix: options.imagePrefix,
              dataDir: options.dataDir,
              local: options.local ?? false,
              concurrency: options.concurrency,
              overrides,
              json: options.json ?? false,
              timings: options.timings ?? false,
            });
          }
          return 0;
        });
      },
    );
}
