import { Command, InvalidArgumentError, Option } from "commander";
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { AXES, parsePair } from "../../../config/permutations.ts";
import { checkBuildSecrets, isConcurrency, loadProjectConfig } from "../../../config/projectConfig.ts";
import { checkRequiredEnv } from "../../../config/requiredEnv.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { DockerBuildError, DockerContainerError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { checkImageStore, ImageStoreLoginError } from "../../../execution/imageStore.ts";
import { type PlannedExecution, type PlannedIteration, type PlannedPermutation, planExecution } from "../../../execution/planExecution.ts";
import { runExecution, runsConcurrently } from "../../../execution/runExecution.ts";
import { type RunFacts, runRuntimeHook, RuntimeHookError } from "../../../execution/runtimeHooks.ts";
import type { ExecutionTimings } from "../../../execution/timings.ts";
import { ulid } from "../../../execution/ulid.ts";
import { type RecordedMeasure, type RecordedOutcome, RunDataStoreError } from "../../../store/runDataStore.ts";
import { type Paint, painter, plain } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, displayPath, openStore } from "../../dataDir.ts";
import { agentEnd, dollars, endedCleanly, failureHint, knownCost, pushFailure, thousands, totalTokens } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { print, printError as error, printJson } from "../../output.ts";
import { type LiveRow, liveRows } from "../../liveRows.ts";
import { textOutput } from "../../textOutput.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";

/** How far a dry run's iteration fields are indented, and how wide their labels are. */
const FIELD_INDENT = "    ";
const LABEL_WIDTH = 10;

/** `label: value`, the value's later lines lined up under its first. */
const field = (label: string, value: string, paint: Paint = plain) =>
  `${FIELD_INDENT}${paint.dim(`${label}:`.padEnd(LABEL_WIDTH))}${value.split("\n").join(`\n${FIELD_INDENT}${" ".repeat(LABEL_WIDTH)}`)}`;

/**
 * The execution's ID, then each permutation's prerun image, with each iteration's postrun image,
 * the environment variables its container is given, by name, any more `docker run` options, the
 * prompt file's contents, and its harness command. With several turns, its session ID, and each turn's prompt and command.
 */
export function renderExecution({ executionId, permutations }: PlannedExecution, paint: Paint = plain): string {
  const f = (label: string, value: string) => field(label, value, paint);
  const blocks = permutations.map((permutation) =>
    [
      `${paint.bold(`Permutation ${permutation.number}`)}: prerun image ${paint.cyan(permutation.prerunImage)}`,
      ...permutation.iterations.flatMap((iteration) => [
        `  ${paint.bold(`Iteration ${iteration.number}`)}: postrun image ${paint.cyan(iteration.postrunImage)}`,
        ...(permutation.env.length > 0 ? [f("env", permutation.env.join(", "))] : []),
        ...(permutation.runOptions.length > 0 ? [f("docker", permutation.runOptions.join(" "))] : []),
        ...(iteration.turns.length === 1
          ? [f("prompt", iteration.turns[0]!.prompt), f("command", iteration.turns[0]!.command)]
          : [
              f("session", iteration.sessionId),
              ...iteration.turns.flatMap(({ prompt, command }, t) => [f(`prompt ${t + 1}`, prompt), f(`turn ${t + 1}`, command)]),
            ]),
      ]),
    ].join("\n"),
  );
  return [`${paint.dim("Execution")} ${paint.bold(executionId)}`, ...blocks].join("\n\n");
}

/** A dry run as `run --dry-run --json` prints it: what `renderExecution` shows, and each permutation's parameters. */
export function executionPlanJson({ executionId, permutations }: PlannedExecution) {
  return {
    executionId,
    permutations: permutations.map(({ number, permutation, prerunImage, env, runOptions, timeoutSeconds, version, iterations }) => ({
      number,
      parameters: Object.fromEntries(AXES.map((axis) => [axis, permutation[axis]])) as Record<(typeof AXES)[number], string>,
      modelId: permutation.modelId,
      harnessVersion: version,
      hash: permutation.hash,
      prerunImage,
      env,
      runOptions,
      timeoutSeconds,
      iterations: iterations.map(({ number, postrunImage, sessionId, turns }) => ({
        number,
        postrunImage,
        sessionId,
        turns: turns.map(({ prompt, command }) => ({ prompt, command })),
      })),
    })),
  };
}

/** `testCase`, with `iterations` in place of its own, if given. */
const withIterations = (testCase: TestCaseDeclaration, iterations?: number): TestCaseDeclaration =>
  iterations === undefined ? testCase : { ...testCase, iterations };

/** What an execution of test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above it, would do. */
export async function planDryRun(cwd: string, name: string, imagePrefix?: string, iterations?: number): Promise<PlannedExecution> {
  const root = await findThunderjarRoot(cwd);
  const executionId = ulid();
  const testCase = withIterations(await loadTestCase(root, name), iterations);
  await checkRequiredEnv(root, testCase);
  return planExecution(root, testCase, executionId, imagePrefix);
}

/** What an execution of test case `name` would do, as text. See `planDryRun`. */
export async function dryRun(cwd: string, name: string, imagePrefix?: string, iterations?: number, paint: Paint = plain): Promise<string> {
  return renderExecution(await planDryRun(cwd, name, imagePrefix, iterations), paint);
}

/** `n/total`, `n` padded to the width of `total`, so the lines line up. */
const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

/** `ms` as e.g. `850ms` or `12.3s`. */
const duration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** A measured value as `run` prints it: JSON, but with an object's keys unquoted, `{passed: 4, failed: 1}`. */
const showValue = (value: unknown): string =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? `{${Object.entries(value)
        .map(([key, v]) => `${key}: ${showValue(v)}`)
        .join(", ")}}`
    : (JSON.stringify(value) ?? String(value));

/** A measured value, coloured: `true` green, `false` red, anything else as it is. */
const paintValue = (paint: Paint, data: unknown) =>
  data === true ? paint.green("true") : data === false ? paint.red("false") : showValue(data);

/** A measure as `run` prints it: its value, or why it has none. */
const showOutcome = (outcome: RecordedOutcome, paint: Paint) =>
  outcome.outcome === "measured"
    ? paintValue(paint, outcome.data)
    : outcome.outcome === "skipped"
      ? paint.yellow(`skipped${outcome.reason ? ` (${outcome.reason})` : ""}`)
      : paint.red(`erroredWhileMeasuring (${outcome.error.message})`);

/** A container run's measures, on one line: `<name>: <value>`, three spaces apart. */
const showMeasures = (result: Record<string, RecordedMeasure>, paint: Paint) =>
  Object.entries(result)
    .map(([name, { outcome }]) => `${paint.blue(`${name}:`)} ${showOutcome(outcome, paint)}`)
    .join("   ");

/**
 * What tells `permutation` apart from the rest of `testCase`'s: each other axis that varies, then
 * its harness, by name alone unless two of the test case's pairs share one, and its initial prompt.
 */
function label(testCase: TestCaseDeclaration, { permutation }: PlannedPermutation): string {
  const varying = AXES.filter((axis) => axis !== "harnessModel" && axis !== "initialPrompt" && testCase[axis].length > 1);
  const harnesses = new Set(testCase.harnessModel.map((pair) => parsePair(pair).harness));
  const harness = harnesses.size === testCase.harnessModel.length ? parsePair(permutation.harnessModel).harness : permutation.harnessModel;
  return [...varying.map((axis) => permutation[axis]), harness, permutation.initialPrompt].join(" | ");
}

/** A container run whose agent didn't end cleanly: its name, how it ended, and a hint of why. */
export type UncleanRun = { run: string; end: string; why?: string };

/** How many container runs a line of `showUnclean` names before `…`. */
const NAMED_RUNS = 8;

/**
 * What `run` says, once it's done, about the agents that didn't end cleanly, of `total`: how many,
 * then a line for each way they ended and why, most first, with how many and which. So a run with
 * many failures says at once whether they share a cause, e.g. a provider out of credits.
 */
export function showUnclean(unclean: UncleanRun[], total: number, paint: Paint = plain): string[] {
  if (unclean.length === 0) return [];
  const groups = new Map<string, UncleanRun[]>();
  for (const run of unclean) {
    const key = `${run.end}\n${run.why ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  const width = String(sorted[0]?.length ?? 1).length;
  return [
    paint.red(`${unclean.length} of ${total} agents didn't end cleanly:`),
    ...sorted.map((runs) => {
      const { end, why } = runs[0] as UncleanRun;
      const names = runs.slice(0, NAMED_RUNS).map(({ run }) => run);
      const which = `${names.join(", ")}${runs.length > NAMED_RUNS ? ", …" : ""}`;
      return `  ${String(runs.length).padStart(width)}×  ${paint.red(end)}${why === undefined ? "" : `  ${why}`}  ${paint.dim(`(${which})`)}`;
    }),
  ];
}

/** What `--timings` calls each phase. */
const PHASE_LABELS: Record<string, string> = {
  build: "building prerun images",
  pushPrerun: "pushing prerun images",
  pullPrerun: "pulling prerun images into the runtime",
  agent: "running agents",
  collect: "reading what agents left",
  commit: "committing postrun images",
  pushPostrun: "pushing postrun images",
  measure: "measuring",
  cleanup: "removing images from the runtime",
};

/**
 * `--timings`' lines: how long the execution took, then each phase that ran, with how many
 * times, how long they took together, and the longest. Phases overlap when several run at once,
 * so their totals can add up to more than the whole.
 */
export function showTimings({ wallMs, phases }: ExecutionTimings): string {
  const rows = Object.entries(phases).map(([phase, { count, totalMs, maxMs }]) => [PHASE_LABELS[phase] ?? phase, `${count}×`, `total ${duration(totalMs)}`, `longest ${duration(maxMs)}`]);
  const widths = [0, 1, 2].map((column) => Math.max(0, ...rows.map((row) => (row[column] as string).length)));
  return [
    `Timings: ${duration(wallMs)} in all`,
    ...rows.map(([label, count, total, longest]) => `  ${(label as string).padEnd(widths[0] as number)}  ${(count as string).padStart(widths[1] as number)}  ${(total as string).padEnd(widths[2] as number)}  ${longest}`),
  ].join("\n");
}

/** What to say when the run data store can't be used, and what that meant for the run. */
const storeFailure = (cwd: string, { path, message }: RunDataStoreError, consequence: string) =>
  `Can't use the run data store, ${displayPath(cwd, path)}, ${consequence}: ${message}\nCheck it can be reached from here, or pass --data-dir to record in a local SQLite file instead.`;

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
 * Runs `iterations` of each permutation, if given, instead of the test case's.
 *
 * With `json`, once the execution is recorded, prints it as JSON, with where it's recorded and each
 * of its container runs' records, whether it's complete or failed. If it stops on an error, prints
 * nothing on stdout.
 */
async function run(
  cwd: string,
  name: string,
  imagePrefix: string,
  dataDir?: string,
  local = false,
  concurrencyOption?: number,
  iterations?: number,
  json = false,
  showsTimings = false,
): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const config = await loadProjectConfig(root);
  const { imageStore, build } = config;
  const runtime = local ? null : config.runtime;
  const concurrency = concurrencyOption ?? runtime?.concurrency ?? 1;
  const concurrent = runsConcurrently(concurrency, build);
  const testCase = withIterations(await loadTestCase(root, name), iterations);
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
  const { store, where } = await openStore(cwd, dataDir, root);
  // Before anything is built or started: otherwise it's found out as the first container run is recorded.
  try {
    await store.check();
  } catch (caught) {
    if (!(caught instanceof RunDataStoreError)) throw caught;
    error(storeFailure(cwd, caught, "so nothing was run"));
    process.exitCode = 1;
    return;
  }
  const permutations = plan.permutations.length;
  // Where a postrun image's push line goes: under its iteration, lined up with it, like its measures.
  const underIteration = " ".repeat(ordinal(permutations, permutations).length + 3);

  // Colour for what's written while running, on a terminal.
  const paint = painter();
  const ellipsis = paint.dim("...");
  const done = paint.green("done");

  print(`${paint.dim("Execution")} ${paint.bold(plan.executionId)}`);
  if (runtime !== null) print(paint.dim(`Running containers with \`${runtime.command.join(" ")}\``));
  if (concurrency > 1) print(paint.dim(`Up to ${concurrency} containers at once`));
  if (build.concurrency > 1) print(paint.dim(`Building up to ${build.concurrency} prerun images at once`));
  // With several at once: what starts each iteration's lines, and its postrun image's.
  const heads = new Map<string, string>();
  // With several at once, on a terminal: each iteration's line, and how its agent ended, by its postrun image.
  const live = concurrent && textOutput().isTTY ? liveRows() : undefined;
  const rows = new Map<string, LiveRow>();
  const outcomes = new Map<string, string>();
  /** Shows `step` after the iteration's outcome on its line, counting how long it takes if `counting`. */
  const showStep = (image: string, step: string, counting = false) =>
    rows.get(image)?.set(`${heads.get(image)}  ${outcomes.get(image)}${step === "" ? "" : `  ${step}`}`, counting);
  const headOf = (permutation: PlannedPermutation, iteration: PlannedIteration) =>
    ` ${paint.bold(ordinal(permutation.number, permutations))}  iteration ${paint.bold(ordinal(iteration.number, testCase.iterations))}  ${paint.magenta(label(testCase, permutation))}`;
  // With several at once, on a terminal: each prerun image's line, by the image. And each prerun image, by where it's pushed.
  const prerunRows = new Map<string, LiveRow>();
  const pulledImages = new Map<string, string>();
  /** Shows `step` after prerun image `image` on its line, counting how long it takes if `counting`. */
  const showPrerun = (image: string, step: string, counting = true) => prerunRows.get(image)?.set(`${paint.cyan(image)}  ${step}`, counting);
  // Whether a container run has started, so a push is of a postrun image.
  let running = false;
  // The last line written, while it's waiting for how its build, push, pull or container run ends.
  let line: WaitingLine | undefined;
  // Whether that line is the one shown while a container run is measured.
  let measuring = false;
  const open = (label: string, transient = false) => {
    measuring = transient;
    line = waitingLine(label, { transient });
  };
  const close = (text: string) => {
    line?.finish(text);
    line = undefined;
  };
  const fail = () => {
    line?.fail();
    line = undefined;
  };
  const facts: RunFacts = {
    executionId: plan.executionId,
    concurrency,
    containers: plan.permutations.reduce((sum, permutation) => sum + permutation.iterations.length, 0),
  };
  /** Runs the runtime's `hook`, if it has one, on a line of its own. False, with the error written, if it fails. */
  const runHook = async (hook: "beforeRun" | "afterRun"): Promise<boolean> => {
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
  if (!(await runHook("beforeRun"))) return;
  let timings: ExecutionTimings | undefined;
  const unclean: UncleanRun[] = [];
  try {
    const record = await runExecution({ root, name, testCase, plan, imagePrefix, imageStore, build, runtime, concurrency }, store, {
      onBuilding: (image) => {
        if (live !== undefined) return void prerunRows.set(image, live.add(`${paint.cyan(image)}  ${paint.dim("building")} `));
        if (concurrent) return print(`Building ${paint.cyan(image)}`);
        open(`Building ${paint.cyan(image)} ${ellipsis} `);
      },
      onBuilt: (image) => {
        if (live !== undefined) {
          // Without an image store, it's ready once built.
          if (imageStore === null) prerunRows.get(image)?.done();
          return showPrerun(image, imageStore === null ? done : "built", false);
        }
        if (concurrent) return print(`Built ${paint.cyan(image)}`);
        close(done);
      },
      onPushing: (image, reference) => {
        if (concurrent && heads.has(image)) return showStep(image, `${paint.dim("pushing")} `, true);
        pulledImages.set(reference, image);
        if (live !== undefined) {
          if (!prerunRows.has(image)) prerunRows.set(image, live.add(""));
          return showPrerun(image, `${paint.dim("pushing")} `);
        }
        if (concurrent) return;
        open(`${running ? underIteration : ""}Pushing ${paint.cyan(reference)} ${ellipsis} `);
      },
      onPushed: (image, reference) => {
        const head = heads.get(image);
        if (concurrent && head !== undefined) {
          if (live !== undefined) return showStep(image, "");
          return print(`${head}  pushed ${paint.cyan(reference)}`);
        }
        if (live !== undefined) {
          // Without a runtime to pull it, it's ready once pushed.
          if (runtime === null) prerunRows.get(image)?.done();
          return showPrerun(image, runtime === null ? done : "pushed", false);
        }
        if (concurrent) return print(`Pushed ${paint.cyan(reference)}`);
        close(done);
      },
      onPulling: (reference) => {
        const image = pulledImages.get(reference);
        if (live !== undefined && image !== undefined) return showPrerun(image, `${paint.dim("pulling into the runtime")} `);
        if (concurrent) return;
        open(`Pulling ${paint.cyan(reference)} into the runtime ${ellipsis} `);
      },
      onPulled: (reference) => {
        const image = pulledImages.get(reference);
        if (live !== undefined && image !== undefined) {
          showPrerun(image, done, false);
          return prerunRows.get(image)?.done();
        }
        if (concurrent) return print(`Pulled ${paint.cyan(reference)} into the runtime`);
        close(done);
      },
      onRunning: (permutation, iteration) => {
        running = true;
        if (concurrent) {
          heads.set(iteration.postrunImage, headOf(permutation, iteration));
          if (live !== undefined) return void rows.set(iteration.postrunImage, live.add(`${headOf(permutation, iteration)}  ${paint.dim("running")} `));
          return print(`${headOf(permutation, iteration)}  started`);
        }
        open(`${headOf(permutation, iteration)}  ${ellipsis} `);
      },
      onRan: (permutation, iteration, record) => {
        const { execution, harnessResult, tokenCosts } = record;
        if (!endedCleanly(execution, harnessResult)) {
          const why = failureHint(record);
          unclean.push({ run: `${permutation.number}-${iteration.number}`, end: agentEnd(execution, harnessResult), ...(why !== undefined && { why }) });
        }
        const ended = (endedCleanly(execution, harnessResult) ? paint.green : paint.red)(agentEnd(execution, harnessResult));
        // Its cost if it can be trusted, else its tokens, if it has either.
        const cost = knownCost(tokenCosts);
        const tokens = totalTokens(tokenCosts);
        const spent = cost !== undefined ? `, ${dollars(cost)}` : tokens !== undefined ? `, ${thousands(tokens)} tokens` : "";
        const outcome = execution.timedOut ? ended : `${ended} ${paint.dim(`(${duration(execution.finishedAt - execution.startedAt)}${spent})`)}`;
        if (live !== undefined) {
          outcomes.set(iteration.postrunImage, outcome);
          return showStep(iteration.postrunImage, "");
        }
        if (concurrent) return print(`${headOf(permutation, iteration)}  ${outcome}`);
        close(outcome);
      },
      onMeasuring: (permutation, iteration) => {
        if (live !== undefined) return showStep(iteration.postrunImage, `${paint.dim("measuring")} `, true);
        if (concurrent) return;
        // Shown only on a terminal, and only until the measures replace it.
        open(`${" ".repeat(ordinal(permutation.number, permutations).length + 3)}${paint.dim("Measuring ...")} `, true);
      },
      onMeasured: (permutation, iteration, result) => {
        if (live !== undefined) return showStep(iteration.postrunImage, showMeasures(result, paint));
        if (concurrent) return print(`${headOf(permutation, iteration)}  ${showMeasures(result, paint)}`);
        // Under the iteration, lined up with it.
        close(`${" ".repeat(ordinal(permutation.number, permutations).length + 3)}${showMeasures(result, paint)}`);
      },
      onDone: (_permutation, iteration) => rows.get(iteration.postrunImage)?.done(),
      onTimings: (spent) => void (timings = spent),
    });
    live?.stop();
    for (const line of showUnclean(unclean, facts.containers, paint)) print(line);
    print(paint.dim(`Recorded in ${displayPath(cwd, where)}`));
    if (json) printJson({ execution: record, recordedIn: where, containerRuns: await store.containerRunsOf(record.executionId) });
    if (record.status === "failed") process.exitCode = 1;
  } catch (caught) {
    // The prerun image whose build, push or pull failed, marked so on its line.
    const failedImage =
      caught instanceof DockerBuildError ? caught.image : caught instanceof DockerPushError || caught instanceof DockerPullError ? pulledImages.get(caught.reference) : undefined;
    if (failedImage !== undefined) showPrerun(failedImage, paint.red("failed"), false);
    // Left as they were, so the error is written under them.
    live?.stop();
    if (caught instanceof DockerUnavailableError) {
      error(`Docker can't be reached, so nothing can be run: ${caught.message}`);
    } else if (caught instanceof DockerBuildError) {
      fail();
      error(`Building ${caught.image} failed: ${caught.message}`);
    } else if (caught instanceof DockerContainerError && concurrent) {
      error(`Running or measuring a container failed: ${caught.message}`);
    } else if (caught instanceof DockerPushError) {
      fail();
      error(pushFailure(caught.reference, caught));
    } else if (caught instanceof DockerPullError) {
      fail();
      error(
        `The runtime couldn't pull ${caught.reference}: ${caught.message}\nMake sure it can reach the image store's registry and is logged in to it. \`thunderjar doctor\` checks this; \`run --local\` runs on the local Docker daemon instead.`,
      );
    } else if (caught instanceof RunDataStoreError) {
      fail();
      error(storeFailure(cwd, caught, "so the execution stopped"));
    } else if (caught instanceof DockerContainerError && line !== undefined && !measuring) {
      fail();
      error(`Running a container failed: ${caught.message}`);
    } else if (caught instanceof DockerContainerError) {
      fail();
      error(`Measuring a container run failed: ${caught.message}`);
    } else {
      throw caught;
    }
    process.exitCode = 1;
  } finally {
    live?.stop();
    line?.stop();
    line = undefined;
    // So a runtime started for the run is stopped, however it ended.
    await runHook("afterRun");
    if (showsTimings && timings !== undefined) print(showTimings(timings));
  }
}

export function createRunCommand(): Command {
  return new Command("run")
    .description(
      "Run a test case: one execution, with a new ID. Builds any missing prerun image, then runs each iteration of each permutation in a container from its prerun image, commits it into its postrun image, takes the task's measurements of it, each in a container from its postrun image, and records it in the run data store. With an image store in thunderjar.config.ts, checks your docker login for its registry first, and pushes each prerun and postrun image there. With a runtime in thunderjar.config.ts, runs the containers there, from the image store, unless --local is given, and up to its concurrency at once, or --concurrency. Builds up to the config's build concurrency of prerun images at once. With more than one of either, each iteration starts as soon as its own prerun image is ready. --iterations overrides the test case's iterations.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option(
      "--dry-run",
      "print the images, environment variables, prompts and harness commands the execution would use, without running anything",
    )
    .option("--local", "run containers on the local Docker daemon, even if thunderjar.config.ts gives a runtime")
    .addOption(
      new Option("--concurrency <n>", "run up to <n> containers at once, instead of the runtime's concurrency, or one at a time").argParser((value: string) => {
        const n = Number(value);
        if (!/^\d+$/.test(value) || !isConcurrency(n)) throw new InvalidArgumentError("It must be a whole number, 1 or more.");
        return n;
      }),
    )
    .addOption(
      new Option("--iterations <n>", "run <n> iterations of each permutation, instead of the test case's iterations").argParser((value: string) => {
        if (!/^\d+$/.test(value) || Number(value) < 1) throw new InvalidArgumentError("It must be a whole number, 1 or more.");
        return Number(value);
      }),
    )
    .option("--timings", "once the execution ends, print how long each of its phases took: builds, pushes, pulls, agents, commits and measuring")
    .addOption(imagePrefixOption())
    .addOption(dataDirOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(
        async (
          name: string,
          options: { dryRun?: boolean; local?: boolean; concurrency?: number; iterations?: number; imagePrefix: string; dataDir?: string; json?: boolean; timings?: boolean },
        ) => {
          if (options.dryRun && options.json) printJson(executionPlanJson(await planDryRun(process.cwd(), name, options.imagePrefix, options.iterations)));
          else if (options.dryRun) print(await dryRun(process.cwd(), name, options.imagePrefix, options.iterations, painter()));
          else await run(process.cwd(), name, options.imagePrefix, options.dataDir, options.local, options.concurrency, options.iterations, options.json, options.timings);
        },
      ),
    );
}
