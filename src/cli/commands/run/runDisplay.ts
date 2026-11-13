/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What `run` and `attach` write while an execution runs, and once it ends: a line for each build,
// push, pull and container run, or, on a terminal with several at once, a row each, rewritten in
// place. Driven by the execution's hooks, whether it runs here (runExecution.ts) or on the
// runtime, its events replayed (runnerEvents.ts).
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import { AXES, parsePair } from "../../../config/permutations.ts";
import { DockerBuildError, DockerContainerError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import type { PlannedIteration, PlannedPermutation } from "../../../execution/planExecution.ts";
import type { RunHooks } from "../../../execution/runExecution.ts";
import type { ExecutionTimings } from "../../../execution/timings.ts";
import { type RecordedMeasure, type RecordedOutcome, RunDataStoreError } from "../../../store/runDataStore.ts";
import { type Paint, plain } from "../../colour.ts";
import { displayPath } from "../../dataDir.ts";
import { agentEnd, dollars, endedCleanly, failureHint, knownCost, pushFailure, thousands, totalTokens } from "../../format.ts";
import { type LiveRow, liveRows } from "../../liveRows.ts";
import { print, printError as error } from "../../output.ts";
import { textOutput } from "../../textOutput.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";

/** `n/total`, `n` padded to the width of `total`, so the lines line up. */
export const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

/** `ms` as e.g. `850ms` or `12.3s`. */
export const duration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

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
 * then a line for each way they ended and why, most first, with how many and which. So an execution with
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

/** What to say when the run data store can't be used, and what that meant for the execution. */
export const storeFailure = (cwd: string, { path, message }: RunDataStoreError, consequence: string) =>
  `Can't use the run data store, ${displayPath(cwd, path)}, ${consequence}: ${message}\nCheck it can be reached from here, or pass --data-dir to record in a local SQLite file instead.`;

/** What a display is told about the execution it shows. */
export type RunDisplayOptions = {
  testCase: TestCaseDeclaration;
  /** How many permutations the execution has. */
  permutations: number;
  /** Whether builds, pushes, pulls and container runs happen at once: see `runsConcurrently`. */
  concurrent: boolean;
  /** Whether its images are pushed to an image store. */
  stored: boolean;
  /** Whether its containers run on a runtime, which pulls each prerun image. */
  remote: boolean;
  paint: Paint;
};

export type RunDisplay = {
  /** The hooks that write the execution's lines. */
  hooks: RunHooks;
  /** Starts a line that waits for how its step ends. */
  open: (label: string, transient?: boolean) => void;
  /** Ends the waiting line with `text`. */
  close: (text: string) => void;
  /** Ends the waiting line as failed. */
  fail: () => void;
  /** Stops redrawing, leaving what's written: before anything else is written, and at the end. */
  stop: () => void;
  /** The agents that didn't end cleanly, so far. */
  unclean: UncleanRun[];
  /** How long each phase took, once the execution has said. */
  timings: () => ExecutionTimings | undefined;
  /**
   * Writes why the execution stopped, if `caught` is an error an execution stops on, marking the
   * prerun image it failed on. False for any other error, with nothing written.
   */
  reportFailure: (caught: unknown, cwd: string) => boolean;
};

/** The display of one execution: see the top of this file. */
export function runDisplay({ testCase, permutations, concurrent, stored, remote, paint }: RunDisplayOptions): RunDisplay {
  // Where a postrun image's push line goes: under its iteration, lined up with it, like its measures.
  const underIteration = " ".repeat(ordinal(permutations, permutations).length + 3);
  const ellipsis = paint.dim("...");
  const done = paint.green("done");
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
  let timings: ExecutionTimings | undefined;
  const unclean: UncleanRun[] = [];
  const hooks: RunHooks = {
    onBuilding: (image) => {
      if (live !== undefined) return void prerunRows.set(image, live.add(`${paint.cyan(image)}  ${paint.dim("building")} `));
      if (concurrent) return print(`Building ${paint.cyan(image)}`);
      open(`Building ${paint.cyan(image)} ${ellipsis} `);
    },
    onBuilt: (image) => {
      if (live !== undefined) {
        // Without an image store, it's ready once built.
        if (!stored) prerunRows.get(image)?.done();
        return showPrerun(image, !stored ? done : "built", false);
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
        if (!remote) prerunRows.get(image)?.done();
        return showPrerun(image, !remote ? done : "pushed", false);
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
      const outcome = execution.timedOut || execution.failedToStart !== undefined ? ended : `${ended} ${paint.dim(`(${duration(execution.finishedAt - execution.startedAt)}${spent})`)}`;
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
  };
  const stop = () => {
    live?.stop();
    line?.stop();
    line = undefined;
  };
  const reportFailure = (caught: unknown, cwd: string): boolean => {
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
      return false;
    }
    return true;
  };
  return { hooks, open, close, fail, stop, unclean, timings: () => timings, reportFailure };
}
