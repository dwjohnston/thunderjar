/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What `run` shows: one frame of the run state as text, for the interactive displayer to draw
// each second, and what `--json` prints. Both pure: everything comes from the state, and the time
// from `now`.
//
// A frame, top to bottom, each part only once there is something to say:
//
//   Execution <id>
//   the test case's parameters, a line an axis, then the matrix: its shape and each permutation
//   where it runs: the runtime, how many at once, the image store and the runtime's hooks
//   a dry run only: each permutation's containers, then each prerun image's Dockerfile
//   Images: each prerun image and where it has got to, until they're all ready
//   a line for each run, and its measures under it
//   Runs: how many are in each status
//   Upload backlog
//   notes: agents that didn't end cleanly, secrets found, images that couldn't be searched
//   Recorded in <where>
//   Timings, with --timings
//
// Warnings aren't in the frame: the displayer writes each to stderr, once.
import { RUN_SCRIPT_PATH } from "../../api/files.ts";
import type { Resolved } from "../../api/declarations.ts";
import { showOverrides } from "../../config/overrides.ts";
import { AXES, abbreviateHash, type Axis } from "../../config/permutations.ts";
import type { RunProgress, RunState, RunStatus, RunTimings } from "../../services/ApplicationState/ApplicationState.ts";
import type { ContainerRunRecord, FoundSecret } from "../../store/runDataStore.ts";
import { resolvePath } from "../../store/stores.ts";
import { agentEnd, endedCleanly, failureHint } from "../runFacts.ts";
import { PHASES } from "../timings.ts";
import type { Manifest, PlannedPermutation, RunRecord } from "./types.ts";

// ---------------------------------------------------------------------------------------------
// Small formats
// ---------------------------------------------------------------------------------------------

/** `n/total`, `n` padded to the width of `total`, so the lines line up. */
export const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

/** `ms` as e.g. `850ms` or `12.3s`. */
export const duration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** Dollars to three places, e.g. `$0.061`, and anything above nothing but below a tenth of a cent as `<$0.001`. */
const dollars = (usd: number) => (usd > 0 && usd < 0.0005 ? "<$0.001" : `$${usd.toFixed(3)}`);

/** A count with thousands separators, e.g. `12,480`. */
const thousands = (n: number) => Math.round(n).toLocaleString("en-US");

/** `NAME=value`, the value in JSON's quotes if a comma-separated list could misread it. */
const envEntry = (name: string, value: string) => `${name}=${/^[\w./:@%+=-]*$/.test(value) ? value : JSON.stringify(value)}`;

/** What a parameter's `resolve` returned, as shown: a string as it is, anything else as JSON. */
const showResolved = (value: Resolved) => (typeof value === "string" ? value : JSON.stringify(value));

/** `path` as shown to someone in `cwd`: from there if it is inside it, else as it is. */
export function displayPath(cwd: string, path: string): string {
  const base = resolvePath(cwd, ".");
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
}

// ---------------------------------------------------------------------------------------------
// The test case and its matrix
// ---------------------------------------------------------------------------------------------

const nameOf = (permutation: PlannedPermutation, axis: Axis) => permutation.parameters.find((parameter) => parameter.axis === axis)?.name ?? "";

/** The names an axis has across the permutations, each once, in plan order. */
const namesOf = (manifest: Manifest, axis: Axis) => [...new Set(manifest.permutations.map((permutation) => nameOf(permutation, axis)))];

/**
 * The parameters the test case names, a line an axis, with its task; then its own environment
 * variables, if it has any (`env` as `NAME=value`, `secretEnv` by name only); then the overrides
 * given, as flags.
 */
function summaryLines(manifest: Manifest): string[] {
  const axis = (name: Axis): [string, string] => [name, namesOf(manifest, name).join(", ")];
  const rows: [string, string][] = [axis("baseImage"), axis("codeState"), axis("promptSet"), axis("harnessModel"), ["task", manifest.task], axis("initialPrompt")];
  const env = Object.entries(manifest.env).map(([name, value]) => envEntry(name, value));
  if (env.length > 0) rows.push(["env", env.join(", ")]);
  if (manifest.secretEnv.length > 0) rows.push(["secretEnv", manifest.secretEnv.join(", ")]);
  if (manifest.overrides !== undefined) rows.push(["overrides", showOverrides(manifest.overrides)]);
  const width = "initialPrompt: ".length;
  return rows.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`);
}

/** The matrix's shape, then each permutation, numbered from 1, with its abbreviated hash. */
function matrixLines(manifest: Manifest): string[] {
  const { permutations } = manifest;
  const count = permutations.length;
  const indexWidth = Math.max(2, String(count).length);
  const widths = AXES.map((axis) => Math.max(0, ...permutations.map((permutation) => nameOf(permutation, axis).length)));
  return [
    `Matrix shape: ${manifest.matrix.shape.join("/")} (${count} ${count === 1 ? "permutation" : "permutations"})`,
    "",
    ...permutations.map((permutation) => {
      const columns = AXES.map((axis, index) => nameOf(permutation, axis).padEnd(widths[index] as number)).join(" | ");
      return `${String(permutation.number).padStart(indexWidth)}  ${columns}   ${abbreviateHash(permutation.hash)}`;
    }),
  ];
}

/** What each parameter with a `resolve` resolved to, a line each, `<axis>  <name>  <value>`, or nothing if none has one. */
function resolvedLines(manifest: Manifest): string[] {
  const rows = new Map<string, [string, string, string]>();
  for (const permutation of manifest.permutations) {
    for (const { axis, name, resolved } of permutation.parameters) {
      if (resolved !== undefined) rows.set(`${axis}\0${name}`, [axis, name, showResolved(resolved)]);
    }
  }
  if (rows.size === 0) return [];
  const widths = [0, 1].map((column) => Math.max(...[...rows.values()].map((row) => (row[column] as string).length)));
  return ["Resolved", ...[...rows.values()].map(([axis, name, value]) => `  ${axis.padEnd(widths[0] as number)}  ${name.padEnd(widths[1] as number)}  ${value}`)];
}

/**
 * Where the execution runs, when it isn't one container at a time on the local Docker daemon with
 * nothing pushed: the runtime, how many containers and builds at once, the image store, and the
 * runtime's hooks. Nothing otherwise.
 */
function whereLines(manifest: Manifest): string[] {
  const { remote, concurrency, buildConcurrency, imageStore, hooks } = manifest;
  const atOnce = concurrency > 1 ? `, up to ${concurrency} at once` : "";
  return [
    ...(remote ? [`Containers run on the runtime${atOnce}`] : concurrency > 1 ? [`Up to ${concurrency} containers at once`] : []),
    ...(buildConcurrency > 1 ? [`Building up to ${buildConcurrency} prerun images at once`] : []),
    ...(imageStore !== null ? [`Images are pushed to ${imageStore.repository}`] : []),
    ...(hooks.beforeExecution !== undefined ? [`Before the execution: ${hooks.beforeExecution.join(" ")}`] : []),
    ...(hooks.afterExecution !== undefined ? [`After the execution:  ${hooks.afterExecution.join(" ")}`] : []),
  ];
}

// ---------------------------------------------------------------------------------------------
// A dry run: what would be run, and built
// ---------------------------------------------------------------------------------------------

/** `label: value`, as a field of an iteration. */
const field = (label: string, value: string) => `    ${`${label}:`.padEnd(10)}${value}`;

/**
 * Each permutation's prerun image, with each iteration's postrun image, where the image store
 * keeps it, if there is one, the variables its
 * container is given (by name, or `NAME=value` for the test case's `env`), any more `docker run`
 * options, and the command it runs: its prerun image's run script.
 */
function containerBlocks(manifest: Manifest): string[] {
  return manifest.permutations.map((permutation) => {
    const env = [...new Set([...permutation.harnessEnv, ...manifest.secretEnv]), ...Object.entries(manifest.env).map(([name, value]) => envEntry(name, value))];
    return [
      `Permutation ${permutation.number}: prerun image ${permutation.prerunImage}`,
      ...manifest.runs
        .filter((run) => run.permutationHash === permutation.hash)
        .flatMap((run) => [
          `  Iteration ${run.iteration}: postrun image ${run.postrunImage}`,
          ...(run.storedPostrunImage !== undefined ? [field("stored", run.storedPostrunImage)] : []),
          ...(env.length > 0 ? [field("env", env.join(", "))] : []),
          ...(permutation.runOptions.length > 0 ? [field("docker", permutation.runOptions.join(" "))] : []),
          field("command", `sh ${RUN_SCRIPT_PATH}`),
        ]),
    ].join("\n");
  });
}

/** Each prerun image, as `# <image>`, then where the image store keeps it, if there is one, then its Dockerfile. */
const dockerfileBlocks = (manifest: Manifest): string[] =>
  manifest.images.map(({ image, stored, dockerfile }) => `# ${image}\n${stored === undefined ? "" : `# stored as ${stored}\n`}${dockerfile.trimEnd()}`);

// ---------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------

/**
 * What tells a permutation apart from the manifest's others: each other axis that varies, then its
 * harness, by name alone unless two of the pairs share one, and its initial prompt.
 */
function labelOf(manifest: Manifest, permutation: PlannedPermutation): string {
  const varying = AXES.filter((axis) => axis !== "harnessModel" && axis !== "initialPrompt" && namesOf(manifest, axis).length > 1);
  const pairs = namesOf(manifest, "harnessModel");
  const harnesses = new Set(manifest.permutations.map(({ harness }) => harness.name));
  const harness = harnesses.size === pairs.length ? permutation.harness.name : nameOf(permutation, "harnessModel");
  return [...varying.map((axis) => nameOf(permutation, axis)), harness, nameOf(permutation, "initialPrompt")].join(" | ");
}

/** A run's cost if it's known, else its tokens, if it has either: `, $0.061` or `, 12,480 tokens`. */
const spentOf = ({ costUsd, tokens }: RunProgress) => (costUsd !== undefined ? `, ${dollars(costUsd)}` : tokens !== undefined ? `, ${thousands(tokens)} tokens` : "");

/** How a run that ended went: how its agent ended, with how long it took and what it spent. */
function endOf(progress: RunProgress): string {
  const { outcome, startedAt, finishedAt, status } = progress;
  if (outcome === undefined) return status;
  // One that timed out says how long in its outcome; one that never started took no time worth showing.
  if (status === "timedOut" || status === "crashed" || startedAt === undefined || finishedAt === undefined) return outcome;
  return `${outcome} (${duration(finishedAt - startedAt)}${spentOf(progress)})`;
}

/** Where a run is, or how it ended, in a few words. */
function showProgress(progress: RunProgress, now: number): string {
  switch (progress.status) {
    case "running":
      // Whole seconds: the frame is redrawn each second.
      return progress.startedAt === undefined ? "running" : `running (${Math.max(0, Math.floor((now - progress.startedAt) / 1000))}s)`;
    case "crashed":
      return `${progress.outcome ?? "crashed"}${progress.error === undefined ? "" : `: ${progress.error}`}`;
    case "uploading":
    case "uploaded":
      return `${endOf({ ...progress, status: "finished" })}  ${progress.status}`;
    default:
      return endOf(progress);
  }
}

/** A line for each run the state knows, in plan order, and under each its measures, once taken. */
function runLines(manifest: Manifest, runs: RunState["runs"], now: number): string[] {
  const indent = " ".repeat(ordinal(manifest.matrix.permutations, manifest.matrix.permutations).length + 3);
  return manifest.runs.flatMap((run) => {
    const progress = runs[run.runId];
    const permutation = manifest.permutations.find(({ hash }) => hash === run.permutationHash);
    if (progress === undefined || permutation === undefined) return [];
    const head = ` ${ordinal(run.permutation, manifest.matrix.permutations)}  iteration ${ordinal(run.iteration, manifest.matrix.iterations)}  ${labelOf(manifest, permutation)}`;
    const measures = Object.entries(progress.measures ?? {}).map(([name, value]) => `${name}: ${value}`);
    return [`${head}  ${showProgress(progress, now)}`, ...(measures.length > 0 ? [`${indent}${measures.join("   ")}`] : [])];
  });
}

/** Lifecycle order, so the counts read left to right as runs move on. */
const STATUS_ORDER: readonly RunStatus[] = ["queued", "running", "committing", "committed", "measuring", "uploading", "uploaded", "finished", "crashed", "timedOut", "cancelled"];

/** How many runs are in each status, e.g. `Runs: 2 queued, 1 running, 1 finished`. */
function countsLine(runs: RunState["runs"]): string {
  const counts = new Map<RunStatus, number>();
  for (const { status } of Object.values(runs)) counts.set(status, (counts.get(status) ?? 0) + 1);
  return `Runs: ${STATUS_ORDER.filter((status) => counts.has(status))
    .map((status) => `${counts.get(status)} ${status}`)
    .join(", ")}`;
}

// ---------------------------------------------------------------------------------------------
// Notes: what is said once the runs are over
// ---------------------------------------------------------------------------------------------

/** A run whose agent didn't end cleanly: its name (`<permutation>-<iteration>`), how it ended, and a hint of why. */
export type UncleanRun = { run: string; end: string; why?: string };

/** How many runs a line of `showUnclean` names before `…`. */
const NAMED_RUNS = 8;

/**
 * What is said about the agents that didn't end cleanly, of `total`: how many, then a line for
 * each way they ended and why, most first, with how many and which. So an execution with many
 * failures says at once whether they share a cause, e.g. a provider out of credits.
 */
export function showUnclean(unclean: UncleanRun[], total: number): string[] {
  if (unclean.length === 0) return [];
  const groups = new Map<string, UncleanRun[]>();
  for (const run of unclean) {
    const key = `${run.end}\n${run.why ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  const width = String(sorted[0]?.length ?? 1).length;
  return [
    `${unclean.length} of ${total} agents didn't end cleanly:`,
    ...sorted.map((runs) => {
      const { end, why } = runs[0] as UncleanRun;
      const names = runs.slice(0, NAMED_RUNS).map(({ run }) => run);
      const which = `${names.join(", ")}${runs.length > NAMED_RUNS ? ", …" : ""}`;
      return `  ${String(runs.length).padStart(width)}×  ${end}${why === undefined ? "" : `  ${why}`}  (${which})`;
    }),
  ];
}

/** A secret found in a run's postrun image: the run's name, and the secret, by name, never value. */
export type SecretRun = { run: string } & FoundSecret;

/** What's said of postrun images that hold a secret: that one pushed has exposed it. */
export const EXPOSED =
  "The images were still committed, measured and pushed, if there's an image store. Treat a secret in one that was pushed as exposed, and rotate it.";

/** How many paths of the files holding a secret are named before `…`. */
const NAMED_PATHS = 3;

const secretFiles = ({ files, paths }: FoundSecret) =>
  `${files} ${files === 1 ? "file" : "files"}: ${paths.slice(0, NAMED_PATHS).join(", ")}${files > NAMED_PATHS ? ", …" : ""}`;

/**
 * What is said about the postrun images, of `total`, that hold a secret's value in their files:
 * how many, then a line for each secret in each, and that a pushed one's are exposed.
 */
export function showSecrets(found: SecretRun[], total: number): string[] {
  if (found.length === 0) return [];
  const images = new Set(found.map(({ run }) => run)).size;
  const width = Math.max(...found.map(({ name }) => name.length));
  return [
    `${images} of ${total} postrun images hold a secret's value in their files:`,
    ...found.map((secret) => `  ${secret.run}  ${secret.name.padEnd(width)}  ${secretFiles(secret)}`),
    EXPOSED,
  ];
}

/** A run whose postrun image couldn't be searched for secrets: its name, and why. */
export type UnsearchedRun = { run: string; reason: string };

/** What is said about the postrun images, of `total`, that couldn't be searched for secrets, and why. */
export function showUnsearched(unsearched: UnsearchedRun[], total: number): string[] {
  if (unsearched.length === 0) return [];
  return [
    `Couldn't search ${unsearched.length} of ${total} postrun images for secrets' values, so they may hold one:`,
    ...unsearched.map(({ run, reason }) => `  ${run}  ${reason}`),
  ];
}

/**
 * The notes of an execution's runs, once they're over: the agents that didn't end cleanly, the
 * secrets found in postrun images, and the images that couldn't be searched. Nothing for a run
 * that was cancelled: it never ran. One that crashed with nothing recorded is unclean, with its error.
 */
export function notesOf(manifest: Manifest, runs: RunRecord[]): string[] {
  const planned = new Map(manifest.runs.map((run) => [run.runId, `${run.permutation}-${run.iteration}`]));
  const unclean: UncleanRun[] = [];
  const secrets: SecretRun[] = [];
  const unsearched: UnsearchedRun[] = [];
  for (const { runId, status, record, error } of runs) {
    const run = planned.get(runId) ?? runId;
    if (record === undefined) {
      if (status === "crashed") unclean.push({ run, end: "crashed", ...(error !== undefined && { why: error }) });
      continue;
    }
    const why = uncleanEnd(record);
    if (why !== undefined) unclean.push({ run, ...why });
    for (const secret of record.secretsFound ?? []) secrets.push({ run, ...secret });
    if (record.secretSearchFailed !== undefined) unsearched.push({ run, reason: record.secretSearchFailed });
  }
  const total = manifest.runs.length;
  return [...showUnclean(unclean, total), ...showSecrets(secrets, total), ...showUnsearched(unsearched, total)];
}

/** How a recorded run's agent ended and a hint of why, if it didn't end cleanly. */
function uncleanEnd(record: ContainerRunRecord): Omit<UncleanRun, "run"> | undefined {
  const { execution, harnessResult } = record;
  if (endedCleanly(execution, harnessResult)) return undefined;
  const why = failureHint(record);
  return { end: agentEnd(execution, harnessResult), ...(why !== undefined && { why }) };
}

// ---------------------------------------------------------------------------------------------
// Timings
// ---------------------------------------------------------------------------------------------

/** What `--timings` calls each phase. */
const PHASE_LABELS: Record<string, string> = {
  build: "building prerun images",
  pushPrerun: "pushing prerun images",
  pullPrerun: "pulling prerun images into the runtime",
  agent: "running agents",
  collect: "reading what agents left",
  commit: "committing postrun images",
  secretSearch: "searching postrun images for secrets",
  pushPostrun: "pushing postrun images",
  measure: "measuring",
};

/**
 * `--timings`' lines: how long the command took, then each phase that ran, in the order they
 * happen, with how many times, how long they took together, and the longest. Phases overlap when
 * several run at once, so their totals can add up to more than the whole.
 */
export function showTimings({ wallMs, phases }: RunTimings): string[] {
  const order = (phase: string) => {
    const index = (PHASES as readonly string[]).indexOf(phase);
    return index === -1 ? PHASES.length : index;
  };
  const rows = Object.entries(phases)
    .sort(([a], [b]) => order(a) - order(b))
    .map(([phase, { count, totalMs, maxMs }]) => [PHASE_LABELS[phase] ?? phase, `${count}×`, `total ${duration(totalMs)}`, `longest ${duration(maxMs)}`] as const);
  const widths = [0, 1, 2].map((column) => Math.max(0, ...rows.map((row) => (row[column] as string).length)));
  return [
    `Timings: ${duration(wallMs)} in all`,
    ...rows.map(([label, count, total, longest]) => `  ${label.padEnd(widths[0] as number)}  ${count.padStart(widths[1] as number)}  ${total.padEnd(widths[2] as number)}  ${longest}`),
  ];
}

// ---------------------------------------------------------------------------------------------
// The frame, and the JSON
// ---------------------------------------------------------------------------------------------

/**
 * One frame of `state` at `now` (epoch ms): see the top of this file. Its parts are a blank line
 * apart, and it ends in a newline. Empty until there is a manifest.
 */
export function renderRunState(state: RunState<Manifest>, now: number): string {
  const { manifest } = state;
  if (manifest === undefined) return "";
  const sections: string[][] = [[`Execution ${manifest.executionId}`], summaryLines(manifest), matrixLines(manifest), resolvedLines(manifest), whereLines(manifest)];

  // A dry run stops at the plan, so it shows all of it.
  if (state.phase === "planned") sections.push(...containerBlocks(manifest).map((block) => [block]), ...dockerfileBlocks(manifest).map((block) => [block]));

  const runs = runLines(manifest, state.runs, now);
  const images = Object.entries(state.images);
  // Once the runs are under way the images are all ready, and no longer news.
  if (images.length > 0 && (runs.length === 0 || images.some(([, status]) => status !== "ready"))) {
    sections.push(["Images:", ...images.map(([reference, status]) => `  ${reference}  ${status}`)]);
  }
  if (runs.length > 0) sections.push(runs, [countsLine(state.runs), ...(state.uploadBacklog > 0 ? [`Upload backlog: ${state.uploadBacklog}`] : [])]);
  sections.push([...(state.notes ?? [])]);
  if (state.recordedIn !== undefined) sections.push([`Recorded in ${state.recordedIn}`]);
  if (manifest.timings && state.timings !== undefined && state.phase === "done") sections.push(showTimings(state.timings));

  return `${sections
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join("\n"))
    .join("\n\n")}\n`;
}

/** What `--json` prints: the command's result, or, if it stopped on an error before it had one, the error's message. */
export function runJson(state: RunState<Manifest>): unknown {
  if (state.result !== undefined) return state.result;
  return state.failure === undefined ? null : { failure: state.failure };
}
