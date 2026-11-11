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
import { ulid } from "../../../execution/ulid.ts";
import { type RecordedMeasure, type RecordedOutcome } from "../../../store/runDataStore.ts";
import { type Paint, painter } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, displayPath, openStore } from "../../dataDir.ts";
import { agentEnd, dollars, endedCleanly, knownCost, pushFailure, thousands, totalTokens } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { type LiveRow, liveRows } from "../../liveRows.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";

/** How far a dry run's iteration fields are indented, and how wide their labels are. */
const FIELD_INDENT = "    ";
const LABEL_WIDTH = 10;

/** `label: value`, the value's later lines lined up under its first. */
const field = (label: string, value: string) =>
  `${FIELD_INDENT}${`${label}:`.padEnd(LABEL_WIDTH)}${value.split("\n").join(`\n${FIELD_INDENT}${" ".repeat(LABEL_WIDTH)}`)}`;

/**
 * The execution's ID, then each permutation's prerun image, with each iteration's postrun image,
 * the environment variables its container is given, by name, any more `docker run` options, the
 * prompt file's contents, and its harness command. With several turns, its session ID, and each turn's prompt and command.
 */
export function renderExecution({ executionId, permutations }: PlannedExecution): string {
  const blocks = permutations.map((permutation) =>
    [
      `Permutation ${permutation.number}: prerun image ${permutation.prerunImage}`,
      ...permutation.iterations.flatMap((iteration) => [
        `  Iteration ${iteration.number}: postrun image ${iteration.postrunImage}`,
        ...(permutation.env.length > 0 ? [field("env", permutation.env.join(", "))] : []),
        ...(permutation.runOptions.length > 0 ? [field("docker", permutation.runOptions.join(" "))] : []),
        ...(iteration.turns.length === 1
          ? [field("prompt", iteration.turns[0]!.prompt), field("command", iteration.turns[0]!.command)]
          : [
              field("session", iteration.sessionId),
              ...iteration.turns.flatMap(({ prompt, command }, t) => [field(`prompt ${t + 1}`, prompt), field(`turn ${t + 1}`, command)]),
            ]),
      ]),
    ].join("\n"),
  );
  return [`Execution ${executionId}`, ...blocks].join("\n\n");
}

/** `testCase`, with `iterations` in place of its own, if given. */
const withIterations = (testCase: TestCaseDeclaration, iterations?: number): TestCaseDeclaration =>
  iterations === undefined ? testCase : { ...testCase, iterations };

/** What an execution of test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above it, would do. */
export async function dryRun(cwd: string, name: string, imagePrefix?: string, iterations?: number): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const executionId = ulid();
  const testCase = withIterations(await loadTestCase(root, name), iterations);
  await checkRequiredEnv(root, testCase);
  return renderExecution(await planExecution(root, testCase, executionId, imagePrefix));
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

/** Writes `message` to stderr after `Error:`, which is red on a terminal. */
const error = (message: string) => console.error(`${painter(process.stderr).error("Error:")} ${message}`);

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
 */
async function run(
  cwd: string,
  name: string,
  imagePrefix: string,
  dataDir?: string,
  local = false,
  concurrencyOption?: number,
  iterations?: number,
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
  const permutations = plan.permutations.length;
  // Where a postrun image's push line goes: under its iteration, lined up with it, like its measures.
  const underIteration = " ".repeat(ordinal(permutations, permutations).length + 3);

  // Colour for what's written while running, on a terminal.
  const paint = painter();
  const ellipsis = paint.dim("...");
  const done = paint.green("done");

  console.log(`${paint.dim("Execution")} ${paint.bold(plan.executionId)}`);
  if (runtime !== null) console.log(paint.dim(`Running containers with \`${runtime.command.join(" ")}\``));
  if (concurrency > 1) console.log(paint.dim(`Up to ${concurrency} containers at once`));
  if (build.concurrency > 1) console.log(paint.dim(`Building up to ${build.concurrency} prerun images at once`));
  // With several at once: what starts each iteration's lines, and its postrun image's.
  const heads = new Map<string, string>();
  // With several at once, on a terminal: each iteration's line, and how its agent ended, by its postrun image.
  const live = concurrent && process.stdout.isTTY ? liveRows() : undefined;
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
  try {
    const record = await runExecution({ root, name, testCase, plan, imagePrefix, imageStore, build, runtime, concurrency }, store, {
      onBuilding: (image) => {
        if (live !== undefined) return void prerunRows.set(image, live.add(`${paint.cyan(image)}  ${paint.dim("building")} `));
        if (concurrent) return console.log(`Building ${paint.cyan(image)}`);
        open(`Building ${paint.cyan(image)} ${ellipsis} `);
      },
      onBuilt: (image) => {
        if (live !== undefined) {
          // Without an image store, it's ready once built.
          if (imageStore === null) prerunRows.get(image)?.done();
          return showPrerun(image, imageStore === null ? done : "built", false);
        }
        if (concurrent) return console.log(`Built ${paint.cyan(image)}`);
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
          return console.log(`${head}  pushed ${paint.cyan(reference)}`);
        }
        if (live !== undefined) {
          // Without a runtime to pull it, it's ready once pushed.
          if (runtime === null) prerunRows.get(image)?.done();
          return showPrerun(image, runtime === null ? done : "pushed", false);
        }
        if (concurrent) return console.log(`Pushed ${paint.cyan(reference)}`);
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
        if (concurrent) return console.log(`Pulled ${paint.cyan(reference)} into the runtime`);
        close(done);
      },
      onRunning: (permutation, iteration) => {
        running = true;
        if (concurrent) {
          heads.set(iteration.postrunImage, headOf(permutation, iteration));
          if (live !== undefined) return void rows.set(iteration.postrunImage, live.add(`${headOf(permutation, iteration)}  ${paint.dim("running")} `));
          return console.log(`${headOf(permutation, iteration)}  started`);
        }
        open(`${headOf(permutation, iteration)}  ${ellipsis} `);
      },
      onRan: (permutation, iteration, { execution, harnessResult, tokenCosts }) => {
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
        if (concurrent) return console.log(`${headOf(permutation, iteration)}  ${outcome}`);
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
        if (concurrent) return console.log(`${headOf(permutation, iteration)}  ${showMeasures(result, paint)}`);
        // Under the iteration, lined up with it.
        close(`${" ".repeat(ordinal(permutation.number, permutations).length + 3)}${showMeasures(result, paint)}`);
      },
      onDone: (_permutation, iteration) => rows.get(iteration.postrunImage)?.done(),
    });
    live?.stop();
    console.log(paint.dim(`Recorded in ${displayPath(cwd, where)}`));
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
    .addOption(imagePrefixOption())
    .addOption(dataDirOption())
    .action(
      reportingConfigErrors(
        async (
          name: string,
          options: { dryRun?: boolean; local?: boolean; concurrency?: number; iterations?: number; imagePrefix: string; dataDir?: string },
        ) => {
          if (options.dryRun) console.log(await dryRun(process.cwd(), name, options.imagePrefix, options.iterations));
          else await run(process.cwd(), name, options.imagePrefix, options.dataDir, options.local, options.concurrency, options.iterations);
        },
      ),
    );
}
