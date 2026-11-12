// An execution's recorded results, summarised: a summary per permutation, combining its iterations,
// and which parameters vary between permutations. Measures are read by the metrics the task's
// measurements declare today (see aggregate.ts). `show` prints it, as a table or as JSON, and
// `view` renders it, so the two always agree. It holds only plain data, so it serialises as JSON.
import { AXES, type Axis } from "../config/permutations.ts";
import type { Measurement } from "../config/measurements.ts";
import type { Better, Stat, TokenCosts } from "../api/declarations.ts";
import type { ContainerRunRecord, ExecutionRecord } from "../store/runDataStore.ts";
import { STATS, type ScoreKind } from "../instruments/instruments.ts";
import { type AggregatedMeasurement, aggregatePermutation, type LeftOut } from "./aggregate.ts";
import { agentEnd, endedCleanly, failureHint, knownCost, totalTokens } from "./runFacts.ts";

/** Values across a permutation's iterations: their mean, least and greatest, and how many iterations had one. */
export type Spread = { mean: number; min: number; max: number; of: number };

/** One permutation's iterations, combined. */
export type PermutationSummary = {
  /** Its place in the matrix, counting from 1. */
  permutation: number;
  /** Each parameter's name, or undefined if no container run of it was recorded. */
  parameters?: Record<Axis, string>;
  /** Its harness, version and model, as its first container run recorded them. */
  harnessModel?: ContainerRunRecord["harnessModel"];
  /** How many of its iterations have a container run recorded. */
  iterations: number;
  /** How long its agents ran, in ms. */
  durationMs?: Spread;
  /** Its runs' tokens, over the runs that reported them. */
  tokens?: Spread;
  /** Its runs' cost in dollars, over the runs whose cost can be trusted. */
  costUsd?: Spread;
  /** How its agents ended, e.g. `done` or `exited 1`, and how many runs ended each way, most first. */
  agent: { end: string; runs: number }[];
  /**
   * Its runs whose agent exited non-zero, timed out, or left no result file, with a hint of why:
   * the last line of its stderr, or else of its result file, if it has one.
   */
  unclean: { run: string; end: string; why?: string }[];
  /** Each measurement's measures, read by its metrics and combined, keyed by name. */
  measures: Record<string, AggregatedMeasurement>;
  /** Its iterations left out of a measurement's metrics, or of one metric, and why, by run name. */
  leftOut: (Omit<LeftOut, "iteration"> & { run: string })[];
  /** Its runs without token costs collected, and why: undefined if recorded before token costs were. */
  withoutTokenCosts: { run: string; tokenCosts?: TokenCosts }[];
};

/** A metric as declared: its name, its statistic, the kind of score that combines, and which way is better. */
export type SummarisedMetric = { name: string; stat: Stat; kind: ScoreKind; better?: Better };

export type ExecutionSummary = {
  execution: ExecutionRecord;
  /** The task's measurements as declared today, in order, and each one's metrics, in order. */
  measurements: { name: string; metrics: SummarisedMetric[] }[];
  /** The axes whose parameter differs between container runs. */
  varyingAxes: Axis[];
  /** The parameters every container run shares. */
  commonParameters: { axis: Axis; name: string }[];
  /** Whether any container run was recorded with token costs: runs recorded before they were have none. */
  recordsTokenCosts: boolean;
  /** One per permutation in the matrix, in order, including any without container runs. */
  permutations: PermutationSummary[];
};

/** A container run's name in its execution: `<permutation>-<iteration>`. */
export const runName = ({ permutation, iteration }: Pick<ContainerRunRecord, "permutation" | "iteration">) => `${permutation}-${iteration}`;

/** The spread of `values`, of `values.length` iterations, or undefined if there are none. */
function spread(values: number[]): Spread | undefined {
  if (values.length === 0) return undefined;
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values), of: values.length };
}

/** How many of each value, most first, ties in the order first seen. */
function tally(values: string[]): { end: string; runs: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([end, runs]) => ({ end, runs })).sort((a, b) => b.runs - a.runs);
}

function summarisePermutation(permutation: number, runs: ContainerRunRecord[], measurements: Measurement[]): PermutationSummary {
  const [first] = runs;
  const { measures, leftOut } = runs.length === 0 ? { measures: {}, leftOut: [] } : aggregatePermutation(runs, measurements);
  return {
    permutation,
    parameters: first && (Object.fromEntries(AXES.map((axis) => [axis, first.parameters[axis].name])) as Record<Axis, string>),
    harnessModel: first?.harnessModel,
    iterations: runs.length,
    durationMs: spread(runs.map(({ execution }) => execution.finishedAt - execution.startedAt)),
    tokens: spread(runs.flatMap(({ tokenCosts }) => totalTokens(tokenCosts) ?? [])),
    costUsd: spread(runs.flatMap(({ tokenCosts }) => knownCost(tokenCosts) ?? [])),
    agent: tally(runs.map(({ execution, harnessResult }) => agentEnd(execution, harnessResult))),
    unclean: runs
      .filter(({ execution, harnessResult }) => !endedCleanly(execution, harnessResult))
      .map((run) => {
        const why = failureHint(run);
        return { run: runName(run), end: agentEnd(run.execution, run.harnessResult), ...(why !== undefined && { why }) };
      }),
    measures,
    leftOut: leftOut.map(({ iteration, ...rest }) => ({ run: runName({ permutation, iteration }), ...rest })),
    withoutTokenCosts: runs.filter(({ tokenCosts }) => tokenCosts?.outcome !== "collected").map((run) => ({ run: runName(run), tokenCosts: run.tokenCosts })),
  };
}

/**
 * `execution`'s container runs summarised, a summary per permutation of its matrix, with each
 * measure combined by `measurements`, the task's as declared today.
 */
export function summariseExecution(execution: ExecutionRecord, runs: ContainerRunRecord[], measurements: Measurement[]): ExecutionSummary {
  const permutations = Array.from({ length: execution.matrix.permutations }, (_, i) =>
    summarisePermutation(
      i + 1,
      runs.filter((run) => run.permutation === i + 1),
      measurements,
    ),
  );
  const namesOf = (axis: Axis) => new Set(runs.map(({ parameters }) => parameters[axis].name));
  return {
    execution,
    measurements: measurements.map(({ name, declaration }) => ({
      name,
      metrics: Object.entries(declaration.metrics).map(([metric, { stat, better }]) => ({
        name: metric,
        stat,
        kind: STATS[stat],
        ...(better === undefined ? {} : { better }),
      })),
    })),
    varyingAxes: AXES.filter((axis) => namesOf(axis).size > 1),
    commonParameters: runs.length === 0 ? [] : AXES.filter((axis) => namesOf(axis).size === 1).map((axis) => ({ axis, name: runs[0]!.parameters[axis].name })),
    recordsTokenCosts: runs.some(({ tokenCosts }) => tokenCosts !== undefined),
    permutations,
  };
}
