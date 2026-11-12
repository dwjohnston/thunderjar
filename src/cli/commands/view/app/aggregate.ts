// The viewer's summary of a permutation's iterations: one row standing for all of them, and which
// parameters every permutation shares, so the table can leave them out.
import type { Axis } from "../../../../config/permutations.ts";
import type { ContainerRunRecord, RecordedMeasure } from "../../../../store/runDataStore.ts";
import { agentEnd, dollars, duration, knownCost, thousands, totalTokens } from "../../../format.ts";

/** The parameter columns, in the order the table shows them. */
export const PARAMETER_COLUMNS: { axis: Axis; label: string }[] = [
  { axis: "baseImage", label: "Base image" },
  { axis: "codeState", label: "Code state" },
  { axis: "promptSet", label: "Prompt set" },
  { axis: "initialPrompt", label: "Initial prompt" },
  { axis: "harnessModel", label: "Harness / model" },
];

/** A run's value for a parameter, as shown. */
export function parameterText(run: ContainerRunRecord, axis: Axis): string {
  if (axis === "harnessModel") return `${run.harnessModel.harness} / ${run.harnessModel.model ?? run.harnessModel.modelId}`;
  return run.parameters[axis]?.name ?? "";
}

/** The parameters with the same value in every run, e.g. one base image across the matrix. */
export function commonParameters(runs: ContainerRunRecord[]): { axis: Axis; label: string; value: string }[] {
  if (runs.length === 0) return [];
  return PARAMETER_COLUMNS.flatMap(({ axis, label }) => {
    const values = new Set(runs.map((run) => parameterText(run, axis)));
    return values.size === 1 ? [{ axis, label, value: [...values][0]! }] : [];
  });
}

/** The runs of each permutation, in the order the runs came. */
export function groupByPermutation(runs: ContainerRunRecord[]): { permutation: number; runs: ContainerRunRecord[] }[] {
  const groups = new Map<number, ContainerRunRecord[]>();
  for (const run of runs) groups.set(run.permutation, [...(groups.get(run.permutation) ?? []), run]);
  return [...groups].map(([permutation, grouped]) => ({ permutation, runs: grouped }));
}

/** A summary of several values: what the cell shows, and a smaller line beneath it. */
export type Summary = { text: string; detail?: string };

/** The mean of `values`, and their range beneath it if they differ. */
function spread(values: number[], show: (n: number) => string): Summary {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { text: show(mean), detail: min === max ? undefined : `${show(min)}–${show(max)}` };
}

/** How many of each, most common first, e.g. `4 done · 1 exited 1`, or `5/5 done` if all agree. */
function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  if (counts.size === 1) return `${values.length}/${values.length} ${values[0]}`;
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => `${count} ${value}`)
    .join(" · ");
}

/** `of n` beneath a summary over fewer than all `n` runs. */
const outOf = (summary: Summary, covered: number, runs: number): Summary =>
  covered === runs ? summary : { ...summary, detail: [summary.detail, `of ${covered}/${runs} runs`].filter(Boolean).join(" · ") };

export const summariseDuration = (runs: ContainerRunRecord[]): Summary =>
  spread(
    runs.map(({ execution }) => execution.finishedAt - execution.startedAt),
    duration,
  );

export const summariseAgent = (runs: ContainerRunRecord[]): Summary => ({ text: tally(runs.map((run) => agentEnd(run.execution, run.harnessResult))) });

/** The mean tokens of the runs that have them, or undefined if none does. */
export function summariseTokens(runs: ContainerRunRecord[]): Summary | undefined {
  const tokens = runs.flatMap(({ tokenCosts }) => totalTokens(tokenCosts) ?? []);
  return tokens.length === 0 ? undefined : outOf(spread(tokens, thousands), tokens.length, runs.length);
}

/** The mean cost of the runs that have one, or undefined if none does. */
export function summariseCost(runs: ContainerRunRecord[]): Summary | undefined {
  const costs = runs.flatMap(({ tokenCosts }) => knownCost(tokenCosts) ?? []);
  return costs.length === 0 ? undefined : outOf(spread(costs, dollars), costs.length, runs.length);
}

const isNumberRecord = (value: unknown): value is Record<string, number> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "number");

/** A measure's values across a permutation's iterations, summarised by their kind. */
function summariseData(data: unknown[]): Summary {
  if (data.every((d) => typeof d === "number")) return spread(data, (n) => String(Math.round(n * 100) / 100));
  if (data.every((d) => typeof d === "boolean")) return { text: `${data.filter(Boolean).length}/${data.length} true` };
  if (data.every(isNumberRecord)) {
    const keys = [...new Set(data.flatMap((d) => Object.keys(d)))];
    return { text: keys.map((key) => `${key} ${data.reduce((sum, d) => sum + (d[key] ?? 0), 0)}`).join(" · ") };
  }
  const distinct = new Set(data.map((d) => JSON.stringify(d)));
  return distinct.size === 1 ? { text: [...distinct][0]! } : { text: `${distinct.size} distinct` };
}

/** One measure across a permutation's iterations, with how many were skipped or errored. */
export function summariseMeasure(measures: (RecordedMeasure | undefined)[]): Summary {
  const data = measures.flatMap((m) => (m?.outcome.outcome === "measured" ? [m.outcome.data] : []));
  const skipped = measures.filter((m) => m?.outcome.outcome === "skipped").length;
  const errored = measures.filter((m) => m?.outcome.outcome === "erroredWhileMeasuring").length;
  const missing = [skipped && `${skipped} skipped`, errored && `${errored} errored`].filter(Boolean).join(" · ");
  if (data.length === 0) return { text: missing };
  const summary = summariseData(data);
  return missing === "" ? summary : { ...summary, detail: [summary.detail, `+${missing}`].filter(Boolean).join(" · ") };
}
