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

// What `run` shows: one frame of the run state, drawn by the displayer each second on a terminal,
// and once at the end. Pure: the same state and time give the same frame.
import { RUN_SCRIPT_PATH } from "../../../api/files.ts";
import { showOverrides } from "../../../config/overrides.ts";
import type { Manifest, PlannedPermutation, PlannedRun } from "../../../runNext/types.ts";
import type { ImageBuildStatus, RunProgress, RunState } from "../../../services/ApplicationState/ApplicationState.ts";
import { type Paint, padEnd, plain } from "../../colour.ts";
import { displayPath } from "../../dataDir.ts";
import { agentEnd, dollars, duration, envEntry, failureHint, knownCost, plural, secretFiles } from "../../format.ts";
import { showMeasures } from "./runDisplay.ts";

export type RenderOptions = {
  paint?: Paint;
  /** The folder the command runs in: paths inside it are shown relative to it. */
  cwd?: string;
};

/** What `--timings` calls each phase, in the order they're shown. */
const PHASE_LABELS: Record<string, string> = {
  build: "building prerun images",
  pushPrerun: "pushing prerun images",
  pullPrerun: "pulling prerun images",
  agent: "running agents",
  collect: "reading what agents left",
  commit: "committing postrun images",
  secretSearch: "searching postrun images for secrets",
  pushPostrun: "pushing postrun images",
  measure: "measuring",
};

const FIELD_INDENT = "    ";
const LABEL_WIDTH = 10;

/** `label: value`, the value's later lines lined up under its first. */
const field = (label: string, value: string, paint: Paint) =>
  `${FIELD_INDENT}${paint.dim(`${label}:`.padEnd(LABEL_WIDTH))}${value.split("\n").join(`\n${FIELD_INDENT}${" ".repeat(LABEL_WIDTH)}`)}`;

/** The variables a permutation's containers are given: by name, or as `NAME=value` for the test case's `env`. */
const envShown = ({ env, secretEnv, testCaseEnv }: PlannedPermutation): string[] => [
  ...new Set([...env, ...secretEnv]),
  ...Object.entries(testCaseEnv).map(([name, value]) => envEntry(name, value)),
];

const runsOf = (manifest: Manifest, permutation: PlannedPermutation): PlannedRun[] => manifest.runs.filter((run) => run.permutation === permutation.number);

/** A dry run: each permutation's pre-run image, and each of its runs' post-run image, variables, options and command. */
function renderDryRun(manifest: Manifest, paint: Paint): string {
  const blocks = manifest.permutations.map((permutation) =>
    [
      `${paint.bold(`Permutation ${permutation.number}`)}: prerun image ${paint.cyan(permutation.prerunImage)}`,
      ...runsOf(manifest, permutation).flatMap((run) => [
        `  ${paint.bold(`Iteration ${run.iteration}`)}: postrun image ${paint.cyan(run.postrunImage)}`,
        ...(envShown(permutation).length > 0 ? [field("env", envShown(permutation).join(", "), paint)] : []),
        ...(permutation.runOptions.length > 0 ? [field("docker", permutation.runOptions.join(" "), paint)] : []),
        field("command", `sh ${RUN_SCRIPT_PATH}`, paint),
      ]),
    ].join("\n"),
  );
  return `${[`${paint.dim("Execution")} ${paint.bold(manifest.executionId)}`, ...blocks].join("\n\n")}\n`;
}

/** What tells `permutation` apart from the manifest's others: each parameter that varies, or its harness model if none does. */
function label(manifest: Manifest, permutation: PlannedPermutation): string {
  const varies = (layer: string) => new Set(manifest.permutations.map(({ parameters }) => parameters.find((parameter) => parameter.layer === layer)?.value)).size > 1;
  const varying = permutation.parameters.filter(({ layer }) => varies(layer));
  const shown = varying.length > 0 ? varying : permutation.parameters.filter(({ layer }) => layer === "harnessModel");
  return shown.map(({ value }) => value).join(" · ");
}

const IMAGE_STATUS: Record<ImageBuildStatus, (paint: Paint) => string> = {
  checking: (paint) => paint.dim("checking"),
  pulling: (paint) => paint.yellow("pulling"),
  building: (paint) => paint.yellow("building"),
  pushing: (paint) => paint.yellow("pushing"),
  ready: (paint) => paint.green("ready"),
  failed: (paint) => paint.red("failed"),
};

/** Where a run is, in words: `running 0:12`, `completed 0:31  $0.061  uploaded`, `crashed (exit 2) 0:03`. */
function showProgress(progress: RunProgress | undefined, now: number, paint: Paint): string {
  if (progress === undefined || progress.status === "queued") return paint.dim("queued");
  const { status, startedAt, finishedAt, record } = progress;
  const took = startedAt === undefined ? undefined : duration((finishedAt ?? now) - startedAt);
  if (status === "running") return `${paint.yellow("running")}${took === undefined ? "" : ` ${paint.dim(took)}`}`;
  const parts: string[] = [];
  if (status === "crashed") {
    const why = record === undefined ? undefined : record.execution.failedToStart !== undefined ? "didn't start" : agentEnd(record.execution, record.harnessResult);
    parts.push(paint.red(`crashed${why === undefined ? "" : ` (${why})`}`));
  } else if (status === "timedOut") {
    parts.push(paint.red(`timed out${record?.execution.timeoutSeconds === undefined ? "" : ` after ${record.execution.timeoutSeconds}s`}`));
  } else if (status === "committing") {
    parts.push(paint.yellow("committing"));
  } else {
    parts.push(paint.green("completed"));
  }
  if (took !== undefined) parts.push(paint.dim(took));
  // It exited 0, but left nothing to read its reply or costs from.
  if (status !== "crashed" && status !== "timedOut" && status !== "committing" && record !== undefined && record.harnessResult === null) parts.push(paint.yellow("no result file"));
  const cost = knownCost(record?.tokenCosts);
  if (cost !== undefined) parts.push(dollars(cost));
  if (status === "uploading") parts.push(paint.yellow("uploading"));
  if (status === "uploaded") parts.push(paint.dim("uploaded"));
  if (progress.measuring === "measuring") parts.push(paint.yellow("measuring"));
  return parts.join("  ");
}

/** How the runs ended, counted: `4 runs: 3 completed, 1 crashed`. */
function summary(manifest: Manifest, runs: RunState<Manifest>["runs"], paint: Paint): string {
  const counts = { completed: 0, crashed: 0, "timed out": 0, "not run": 0 };
  for (const { runId } of manifest.runs) {
    const status = runs[runId]?.status;
    if (status === "crashed") counts.crashed++;
    else if (status === "timedOut") counts["timed out"]++;
    else if (status === "committed" || status === "uploading" || status === "uploaded") counts.completed++;
    else counts["not run"]++;
  }
  const shown = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([what, count]) => (what === "completed" ? paint.green(`${count} ${what}`) : paint.red(`${count} ${what}`)));
  return `${plural(manifest.runs.length, "run")}: ${shown.join(", ")}`;
}

function showTimings(timings: NonNullable<RunState["timings"]>): string[] {
  const rows = Object.keys(PHASE_LABELS)
    .filter((phase) => timings[phase] !== undefined)
    .map((phase) => {
      const { count, totalMs, maxMs } = timings[phase] as NonNullable<(typeof timings)[string]>;
      return [PHASE_LABELS[phase] as string, `${count}×`, `total ${duration(totalMs)}`, `longest ${duration(maxMs)}`];
    });
  const widths = [0, 1, 2].map((column) => Math.max(0, ...rows.map((row) => (row[column] as string).length)));
  return [
    "Timings",
    ...rows.map(([what, count, total, longest]) => `  ${(what as string).padEnd(widths[0] as number)}  ${(count as string).padStart(widths[1] as number)}  ${(total as string).padEnd(widths[2] as number)}  ${longest}`),
  ];
}

/** `frame` with each line cut to `columns` characters, not counting colour codes, so none wraps on a terminal that wide. */
export function fitTo(frame: string, columns: number): string {
  const cut = (line: string) => {
    let visible = 0;
    let out = "";
    // oxlint-disable-next-line no-control-regex -- a colour code starts with the escape character
    for (const part of line.split(/(\x1b\[\d+m)/)) {
      if (part.startsWith("\x1b[")) out += part;
      else if (visible < columns) {
        out += part.slice(0, columns - visible);
        visible += part.length;
      }
    }
    return visible > columns ? `${out.slice(0, -1)}…\x1b[0m` : out;
  };
  return frame.split("\n").map(cut).join("\n");
}

/**
 * One frame of `state`, at `now`. "" before there's a manifest. A dry run is the manifest alone.
 * Otherwise: the execution, each pre-run image and where it is, each run on a line with how it
 * ended and its measures under it, and, once it's over, how the runs ended and where they're recorded.
 */
export function renderRun(state: RunState<Manifest>, now: number, { paint = plain, cwd }: RenderOptions = {}): string {
  const { manifest } = state;
  if (manifest === undefined) return "";
  if (state.mode === "dry-run") return renderDryRun(manifest, paint);

  const lines: string[] = [`${paint.dim("Execution")} ${paint.bold(manifest.executionId)}  ${manifest.testCaseName}`];
  const facts = [plural(manifest.permutations.length, "permutation"), plural(manifest.runs.length, "run"), `up to ${manifest.concurrency} at once`];
  if (manifest.imageStore !== null) facts.push(`images stored in ${manifest.imageStore}`);
  if (Object.keys(manifest.overrides).length > 0) facts.push(`overrides: ${showOverrides(manifest.overrides)}`);
  lines.push(paint.dim(`  ${facts.join(", ")}`));

  const images = Object.entries(state.images);
  if (images.length > 0) {
    const width = Math.max(...images.map(([reference]) => reference.length));
    lines.push("", paint.bold("Images"), ...images.map(([reference, status]) => `  ${padEnd(paint.cyan(reference), width)}  ${IMAGE_STATUS[status](paint)}`));
  }

  if (Object.keys(state.runs).length > 0) {
    const names = manifest.runs.map((run) => `${run.permutation}.${run.iteration}`);
    const nameWidth = Math.max(...names.map((name) => name.length));
    const labels = new Map(manifest.permutations.map((permutation) => [permutation.number, label(manifest, permutation)]));
    const labelWidth = Math.max(...[...labels.values()].map((text) => text.length));
    const under = " ".repeat(nameWidth + 4);
    lines.push("", paint.bold("Runs"));
    manifest.runs.forEach((run, i) => {
      const progress = state.runs[run.runId];
      lines.push(`  ${paint.bold((names[i] as string).padEnd(nameWidth))}  ${padEnd(paint.magenta(labels.get(run.permutation) ?? ""), labelWidth)}  ${showProgress(progress, now, paint)}`);
      const measures = progress?.record?.result ?? {};
      if (Object.keys(measures).length > 0) lines.push(`${under}${showMeasures(measures, paint)}`);
      if (progress?.error !== undefined) lines.push(`${under}${paint.red(progress.error)}`);
      // Why its agent didn't end cleanly, as far as what it left says: its reported error, or its stderr's last line.
      else if (progress?.record !== undefined && (progress.status === "crashed" || progress.status === "timedOut")) {
        const hint = failureHint(progress.record);
        if (hint !== undefined) lines.push(`${under}${paint.dim(hint)}`);
      }
      for (const secret of progress?.record?.secretsFound ?? []) {
        lines.push(`${under}${paint.red(`Its postrun image holds the value of ${secret.name}`)} ${paint.dim(`(${secretFiles(secret)})`)}`);
      }
      if (progress?.record?.secretSearchFailed !== undefined) {
        lines.push(`${under}${paint.yellow(`Its postrun image couldn't be searched for secrets: ${progress.record.secretSearchFailed}`)}`);
      }
    });
  }
  if (state.uploadBacklog > 0) lines.push("", `Upload backlog: ${state.uploadBacklog}`);

  const over = state.execution?.finishedAt !== undefined;
  if (over) {
    lines.push("", summary(manifest, state.runs, paint));
    const exposed = manifest.runs.filter(({ runId }) => (state.runs[runId]?.record?.secretsFound ?? []).length > 0).length;
    if (exposed > 0) {
      lines.push(paint.red(`${plural(exposed, "postrun image")} of ${manifest.runs.length} hold a secret's value in their files. Treat one that was pushed as exposed, and rotate it.`));
    }
  } else if (state.mode === "build-only" && images.length > 0 && images.every(([, status]) => status === "ready")) {
    lines.push("", paint.green(`${plural(images.length, "prerun image")} ready`));
  }
  if (state.execution !== undefined && state.recordedIn !== undefined) {
    lines.push(paint.dim(`Recorded in ${cwd === undefined ? state.recordedIn : displayPath(cwd, state.recordedIn)}`));
  }
  if (state.showTimings && state.timings !== undefined && (over || state.mode === "build-only")) lines.push("", ...showTimings(state.timings));
  return `${lines.join("\n")}\n`;
}
