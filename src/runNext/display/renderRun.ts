/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What `runNext` shows: the run state as text, and as `--json`. Pure: the levels below only write to
// the state, and the Displayer writes what these return. The text is what the old `run` wrote
// (src/cli/commands/run/run.ts and runDisplay.ts), built with its helpers.
import { executionPlanJson, renderExecution } from "../../cli/commands/run/run.ts";
import {
  label,
  ordinal,
  type SecretRun,
  showMeasures,
  showRan,
  showSecrets,
  showTimings,
  showUnclean,
  showUnsearched,
  type UncleanRun,
  type UnsearchedRun,
} from "../../cli/commands/run/runDisplay.ts";
import type { Paint } from "../../cli/colour.ts";
import { displayPath } from "../../cli/dataDir.ts";
import { agentEnd, endedCleanly, failureHint } from "../../cli/format.ts";
import { elapsed } from "../../cli/waitingLine.ts";
import type { PlannedExecution } from "../../execution/planExecution.ts";
import type { Frame } from "../../services/Displayer/Displayer.ts";
import type { ContainerRunRecord, RecordedMeasure } from "../../services/RunDataStore/RunDataStore.ts";
import type { Manifest, PlannedRun, RunDetails, RunEvent, RunStateOf } from "../types.ts";

export type RunRendererOptions = {
  paint: Paint;
  /** What `Recorded in ...` is shown relative to. */
  cwd: string;
  /** Whether to end with how long each phase took: `--timings`. */
  showTimings: boolean;
};

/**
 * One line of the frame, or more for text with newlines in it. `final` once it will never change.
 * "pending" holds the place of a line that may still come, so nothing after it is settled before it.
 */
type Item = { text: string; final: boolean } | "pending";

type HookEvent = Extract<RunEvent, { type: "hook" }>;
type ImageEvent = Extract<RunEvent, { type: "image" }>;
type RunLogEvent = Extract<RunEvent, { type: "run" }>;

/** A step that waits: its line's label, when it started, and how it ended, once it has. */
type Step = { label: string; since: number; end?: string };

/** What the log says of one run, so far. */
type RunProgress = {
  run: PlannedRun;
  startedAt?: number;
  record?: ContainerRunRecord;
  measuringAt?: number;
  measured?: Record<string, RecordedMeasure>;
  /** Whether its measuring is over, whether or not it left measures. */
  measureEnded: boolean;
  upload?: { reference: string; at: number; end?: "done" | "failed" };
  /** The step its row counts, with several at once. */
  current?: { name: "measuring" | "pushing"; at: number };
  done: boolean;
};

/** The manifest as the old `run`'s plan, for its helpers. */
function asPlannedExecution(manifest: Manifest): PlannedExecution {
  return {
    executionId: manifest.executionId,
    permutations: manifest.permutations.map((permutation) => ({
      number: permutation.number,
      permutation: permutation.hashed,
      prerunImage: permutation.prerunImage,
      env: permutation.env,
      testCaseEnv: permutation.testCaseEnv,
      secretEnv: permutation.secretEnv,
      runOptions: permutation.runOptions,
      timeoutSeconds: permutation.timeoutSeconds,
      harness: permutation.harness,
      collectTokenCosts: permutation.collectTokenCosts,
      version: permutation.version,
      modelId: permutation.modelId,
      iterations: manifest.runs.filter((run) => run.permutation.number === permutation.number).map((run) => ({ number: run.iteration, postrunImage: run.postrunImage })),
    })),
  };
}

/** Each run the log mentions, in the order they started, with what's happened to it. */
function runsOf(manifest: Manifest, log: readonly RunEvent[]): Map<string, RunProgress> {
  const planned = new Map(manifest.runs.map((run) => [run.runId, run]));
  const runs = new Map<string, RunProgress>();
  for (const event of log) {
    if (event.type !== "run") continue;
    const run = planned.get(event.runId);
    if (run === undefined) continue;
    const progress = runs.get(event.runId) ?? { run, measureEnded: false, done: false };
    runs.set(event.runId, progress);
    const measuring = () => progress.measuringAt !== undefined && !progress.measureEnded && !progress.done;
    const uploading = () => progress.upload !== undefined && progress.upload.end === undefined;
    switch (event.step) {
      case "started":
        progress.startedAt = event.at;
        break;
      case "ran":
        progress.record = event.record;
        break;
      case "measuring":
        progress.measuringAt = event.at;
        progress.current = { name: "measuring", at: event.at };
        break;
      case "measured":
      case "measureFailed":
        if (event.step === "measured") progress.measured = event.result;
        progress.measureEnded = true;
        progress.current = uploading() ? { name: "pushing", at: (progress.upload as { at: number }).at } : undefined;
        break;
      case "uploading":
        progress.upload = { reference: event.reference, at: event.at };
        progress.current = { name: "pushing", at: event.at };
        break;
      case "uploaded":
      case "uploadFailed":
        progress.upload = { reference: event.reference, at: progress.upload?.at ?? event.at, end: event.step === "uploaded" ? "done" : "failed" };
        progress.current = measuring() ? { name: "measuring", at: progress.measuringAt as number } : undefined;
        break;
      case "done":
        progress.done = true;
        progress.measureEnded = true;
        if (progress.current?.name === "measuring") progress.current = undefined;
        break;
    }
  }
  return runs;
}

/** What the old `onRan` hook collected for the lines written once the execution is recorded. */
function collected(manifest: Manifest, log: readonly RunEvent[]): { unclean: UncleanRun[]; secrets: SecretRun[]; unsearched: UnsearchedRun[] } {
  const planned = new Map(manifest.runs.map((run) => [run.runId, run]));
  const unclean: UncleanRun[] = [];
  const secrets: SecretRun[] = [];
  const unsearched: UnsearchedRun[] = [];
  for (const event of log) {
    if (event.type !== "run" || event.step !== "ran") continue;
    const run = planned.get(event.runId);
    if (run === undefined) continue;
    const name = `${run.permutation.number}-${run.iteration}`;
    const { record } = event;
    if (!endedCleanly(record.execution, record.harnessResult)) {
      const why = failureHint(record);
      unclean.push({ run: name, end: agentEnd(record.execution, record.harnessResult), ...(why !== undefined && { why }) });
    }
    for (const secret of record.secretsFound ?? []) secrets.push({ run: name, ...secret });
    if (record.secretSearchFailed !== undefined) unsearched.push({ run: name, reason: record.secretSearchFailed });
  }
  return { unclean, secrets, unsearched };
}

/**
 * Renders the run state as a frame: what's settled, which only grows, and what's still going, which
 * is redrawn. A dry run's plan, or an execution's lines as they're known, in the old `run`'s format.
 */
export function createRunRenderer({ paint, cwd, showTimings: showsTimings }: RunRendererOptions): (state: RunStateOf, now: number) => Frame {
  const ellipsis = paint.dim("...");
  const done = paint.green("done");
  const failed = paint.red("failed");
  const settledLine = (text: string): Item => ({ text, final: true });

  return (state, now) => {
    const { manifest, details } = state;
    if (manifest === undefined) return { settled: "", live: "" };
    if (details?.mode === "dry-run") return { settled: `${renderExecution(asPlannedExecution(manifest), paint)}\n`, live: "" };

    const log = details?.log ?? [];
    const finished = details?.finished;
    const isHook = (event: RunEvent): event is HookEvent => event.type === "hook";
    const after = log.filter(isHook).filter((event) => event.hook === "afterExecution");
    const body = log.filter((event) => !(event.type === "hook" && event.hook === "afterExecution"));
    // Once the execution is over, nothing before its afterExecution is still going: a step that never ended is left as it is.
    const over = finished !== undefined || after.length > 0;
    const concurrent = manifest.concurrency > 1 || manifest.config.build.concurrency > 1;

    /** A waiting line: ended, or counting how long it's been. */
    const waiting = ({ label: text, since, end }: Step, stillGoing = !over): Item => {
      if (end !== undefined) return { text: `${text}${end}`, final: true };
      return stillGoing ? { text: `${text}${paint.dim(elapsed(now - since))}`, final: false } : { text: text.trimEnd(), final: true };
    };
    /** Each hook's line: `running` starts one, and the next `done` or `failed` ends it. */
    const hookSteps = (events: readonly HookEvent[]): Step[] => {
      const steps: Step[] = [];
      for (const event of events) {
        const text = `Running the runtime's ${event.hook}, ${paint.cyan(`\`${event.command.join(" ")}\``)} ${ellipsis} `;
        const open = steps.findLast((step) => step.end === undefined && step.label === text);
        if (event.step === "running") steps.push({ label: text, since: event.at });
        else if (open !== undefined) open.end = event.step === "done" ? done : failed;
        else steps.push({ label: text, since: event.at, end: event.step === "done" ? done : failed });
      }
      return steps;
    };

    const permutations = manifest.permutations.length;
    // Where a run's measures and its postrun image's push go: under its line, lined up with it.
    const under = " ".repeat(ordinal(permutations, permutations).length + 3);
    const headOf = ({ permutation, iteration }: PlannedRun) =>
      ` ${paint.bold(ordinal(permutation.number, permutations))}  iteration ${paint.bold(ordinal(iteration, manifest.config.iterations))}  ${paint.magenta(label(manifest.config, { permutation: permutation.hashed }))}`;
    const runs = runsOf(manifest, body);

    /** One line for each step, as it ends: hooks and images in log order, then each run in the order it started. */
    const sequential = (): Item[] => {
      type ImageStep = Step & { kind: number; reference?: string };
      const groups = new Map<string, HookEvent[] | ImageStep[]>();
      body.forEach((event, index) => {
        if (event.type === "hook") return void groups.set(`hook ${index}`, [event]);
        if (event.type !== "image") return;
        const steps = (groups.get(`image ${event.image}`) ?? []) as ImageStep[];
        groups.set(`image ${event.image}`, steps);
        const image: ImageEvent = event;
        const [kind, starts, ok] =
          image.step === "building" || image.step === "built" || image.step === "buildFailed"
            ? [0, image.step === "building", image.step === "built"]
            : image.step === "pushing" || image.step === "pushed" || image.step === "pushFailed"
              ? [1, image.step === "pushing", image.step === "pushed"]
              : [2, image.step === "pulling", image.step === "pulled"];
        const reference = "reference" in image ? image.reference : undefined;
        const text =
          kind === 0 ? `Building ${paint.cyan(image.image)} ${ellipsis} ` : kind === 1 ? `Pushing ${paint.cyan(reference as string)} ${ellipsis} ` : `Pulling ${paint.cyan(reference as string)} into the runtime ${ellipsis} `;
        const open = steps.findLast((step) => step.kind === kind && step.reference === reference && step.end === undefined);
        if (starts) steps.push({ kind, reference, label: text, since: image.at });
        else if (open !== undefined) open.end = ok ? done : failed;
        else steps.push({ kind, reference, label: text, since: image.at, end: ok ? done : failed });
      });
      const prep: Item[] = [];
      const hooks: HookEvent[] = [];
      for (const [key, group] of groups) {
        if (key.startsWith("hook ")) hooks.push(...(group as HookEvent[]));
        // For one image: its build, then its push, then its pull.
        else prep.push(...(group as ImageStep[]).toSorted((a, b) => a.kind - b.kind).map((step) => waiting(step)));
      }
      // Hooks before the execution come before anything it does.
      const items: Item[] = [...hookSteps(hooks).map((step) => waiting(step)), ...prep];
      for (const progress of runs.values()) {
        const { run, record, upload } = progress;
        items.push(waiting({ label: `${headOf(run)}  ${ellipsis} `, since: progress.startedAt ?? now, end: record === undefined ? undefined : showRan(record, paint) }));
        if (progress.measured !== undefined) items.push(settledLine(`${under}${showMeasures(progress.measured, paint)}`));
        else if (!progress.measureEnded && !over) {
          // Shown only while it's measured, until the measures replace it.
          items.push(progress.measuringAt === undefined ? "pending" : { text: `${under}${paint.dim("Measuring ...")} ${paint.dim(elapsed(now - progress.measuringAt))}`, final: false });
        }
        if (upload !== undefined) {
          items.push(waiting({ label: `${under}Pushing ${paint.cyan(upload.reference)} ${ellipsis} `, since: upload.at, end: upload.end === undefined ? undefined : upload.end === "done" ? done : failed }));
        } else if (!over && (!progress.done || (run.storedPostrunImage !== undefined && record?.execution.failedToStart === undefined))) {
          // Its postrun image is pushed in the background, so its push may start after the run is done.
          items.push("pending");
        }
      }
      return items;
    };

    /** A whole line for each thing that happens, as it happens, then a row for each run still going. */
    const concurrently = (): Item[] => {
      // Hooks before the execution come before anything it does.
      const items: Item[] = hookSteps(body.filter(isHook)).map((step) => waiting(step));
      for (const event of body) {
        if (event.type === "image") {
          if (event.step === "building") items.push(settledLine(`Building ${paint.cyan(event.image)}`));
          if (event.step === "built") items.push(settledLine(`Built ${paint.cyan(event.image)}`));
          if (event.step === "pushed") items.push(settledLine(`Pushed ${paint.cyan(event.reference)}`));
          if (event.step === "pulled") items.push(settledLine(`Pulled ${paint.cyan(event.reference)} into the runtime`));
        } else if (event.type === "run") {
          const run = runs.get(event.runId)?.run;
          if (run === undefined) continue;
          const head = headOf(run);
          const run_: RunLogEvent = event;
          if (run_.step === "started") items.push(settledLine(`${head}  started`));
          if (run_.step === "ran") items.push(settledLine(`${head}  ${showRan(run_.record, paint)}`));
          if (run_.step === "measured") items.push(settledLine(`${head}  ${showMeasures(run_.result, paint)}`));
          if (run_.step === "uploaded") items.push(settledLine(`${head}  pushed ${paint.cyan(run_.reference)}`));
        }
      }
      if (over) return items;
      for (const { run, startedAt, record, current, done: isDone } of runs.values()) {
        if (startedAt === undefined || (isDone && current === undefined)) continue;
        const head = headOf(run);
        if (record === undefined) items.push({ text: `${head}  ${paint.dim("running")} ${paint.dim(elapsed(now - startedAt))}`, final: false });
        else if (current === undefined) items.push({ text: `${head}  ${showRan(record, paint)}`, final: false });
        else items.push({ text: `${head}  ${showRan(record, paint)}  ${paint.dim(current.name)} ${paint.dim(elapsed(now - current.at))}`, final: false });
      }
      return items;
    };

    const { config } = manifest;
    const items: Item[] = [
      settledLine(`${paint.dim("Execution")} ${paint.bold(manifest.executionId)}`),
      ...(config.runtime !== null ? [settledLine(paint.dim(`Running containers with \`${config.runtime.command.join(" ")}\``))] : []),
      ...(manifest.concurrency > 1 ? [settledLine(paint.dim(`Up to ${manifest.concurrency} containers at once`))] : []),
      ...(config.build.concurrency > 1 ? [settledLine(paint.dim(`Building up to ${config.build.concurrency} prerun images at once`))] : []),
      ...(concurrent ? concurrently() : sequential()),
    ];
    if (finished !== undefined && details?.mode !== "build-only") {
      const { unclean, secrets, unsearched } = collected(manifest, body);
      const total = manifest.runs.length;
      items.push(
        ...[...showUnclean(unclean, total, paint), ...showSecrets(secrets, total, paint), ...showUnsearched(unsearched, total, paint), paint.dim(`Recorded in ${displayPath(cwd, finished.recordedIn)}`)].map(settledLine),
      );
    }
    // afterExecution runs last, whatever came before it, so its line is still going until it ends.
    const afterSteps = hookSteps(after);
    items.push(...afterSteps.map((step) => waiting(step, true)));
    const afterEnded = config.runtime?.afterExecution === undefined || afterSteps.some((step) => step.end !== undefined);
    if (showsTimings && finished !== undefined && afterEnded) items.push(settledLine(showTimings(finished.timings)));

    const firstGoing = items.findIndex((item) => item === "pending" || !item.final);
    const text = (shown: Item[]) => shown.map((item) => (item === "pending" ? "" : `${item.text}\n`)).join("");
    return firstGoing === -1 ? { settled: text(items), live: "" } : { settled: text(items.slice(0, firstGoing)), live: text(items.slice(firstGoing)) };
  };
}

/**
 * What `--json` prints: a dry run's plan, or, once the execution is recorded, its record, where
 * it's recorded and its container runs' records. Undefined, so nothing is printed, until then.
 */
export function runJson(state: RunStateOf): unknown {
  const { manifest } = state;
  const details: RunDetails | undefined = state.details;
  if (manifest === undefined || details === undefined) return undefined;
  if (details.mode === "dry-run") return executionPlanJson(asPlannedExecution(manifest), manifest.config.overrides);
  if (details.finished === undefined) return undefined;
  const { execution, recordedIn, containerRuns } = details.finished;
  return { execution, recordedIn, containerRuns };
}
