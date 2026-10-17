// The run data store — spec/085-test-case-results.md#what-gets-written-to-the-run-data-store
// and spec/050-setup-and-configure.md#thunderjarconfigts. A small interface, so a later store
// (SQLite, a shared remote one) drops in behind it without changing anything above it. For
// now the only store is a JSON file under `.thunderjar/.data/`, which `init` gitignores; the
// config's `runDataStore` entry isn't read yet.
//
// A container run is recorded with an empty Result straight after it runs; its measures are
// merged in afterwards with recordMeasures, the same way a backfill will add them later.
// Aggregation results sit beside the container run records, in the same file. They are
// computed in src/measuring/aggregate.ts; the store only keeps them.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Axis } from "../matrix/resolve.ts";

/**
 * A MeasurementResult as stored. An `Error` doesn't survive JSON, so an instrument's error is
 * kept as its message.
 */
export type RecordedOutcome =
  | { outcome: "measured"; data: unknown }
  | { outcome: "skipped"; reason?: string }
  | { outcome: "erroredWhileMeasuring"; error: { message: string } };

/** One measure in a container run's result — spec/085-test-case-results.md#the-result-record. */
export interface RecordedMeasure {
  instrument: string;
  /** Of the measurement that produced this measure — see hashMeasurement. */
  contentHash: string;
  /** When it was measured — not when the container run happened. */
  measuredAt: string;
  outcome: RecordedOutcome;
}

/** A container run's measures, keyed by measurement name. */
export type Result = Record<string, RecordedMeasure>;

/** How the agent ran, from run.json — spec/085-test-case-results.md#execution. */
export interface Execution {
  /** Epoch ms, harness start. */
  startedAt: number;
  /** Epoch ms, harness exit. */
  finishedAt: number;
  exitCode: number;
  /** Not recorded yet. */
  outcome?: "completed" | "failed" | "timedOut";
}

export interface ContainerRunRecord {
  /** The ULID from the postrun tag. */
  executionId: string;
  /** The test case, by name. Not in the spec's record; `executions` lists and filters by it. */
  testCase: string;
  /** The test case's task, by name. */
  task: string;
  /** Full and untruncated; the 8-character copy in the tag isn't authoritative. */
  permutationHash: string;
  /** Counts from 0, as in the postrun tag. */
  iteration: number;
  /** The postrun tag, so the artifact is reachable from the record. */
  postrunImage: string;
  /** ISO timestamp of when the agent started. */
  ranAt: string;
  /** Each resolved parameter, by name and parameter hash. */
  parameters: Record<Axis, { name: string; parameterHash: string }>;
  /** The resolved harness/model pair. */
  harnessModel: { family: string; version: string; modelId: string };
  result: Result;
  /** Not recorded yet — spec/087-collecting-token-costs.md. */
  tokenCosts?: unknown;
  execution: Execution;
}

/** One way a measure's values combine — spec/085-test-case-results.md#how-a-measures-values-combine. */
export type AggregationMethod = "rate" | "count" | "mean" | "median" | "min" | "max" | "sum";

/** What one method gives: a number, or for `Record<string, number>` values, a record of them. */
export type AggregatedValue = number | Record<string, number>;

/**
 * One measure combined across a permutation's iterations: how many iterations gave it a value,
 * then a key per method its measurement chose, in the order it chose them. With nothing
 * measured there are no method keys.
 */
export type AggregatedMeasure = { measured: number } & { [M in AggregationMethod]?: AggregatedValue };

/**
 * One permutation of one execution, its iterations combined — spec/085-test-case-results.md#aggregation-results.
 * Recomputed from the container run records whenever a measure is recorded.
 */
export interface AggregationResult {
  executionId: string;
  /** Full and untruncated, as in ContainerRunRecord. */
  permutationHash: string;
  /** How many container runs it combines. */
  iterations: number;
  /** By measurement name: only the measurements the task declared when it was computed. */
  measures: Record<string, AggregatedMeasure>;
  /** Of each iteration's `finishedAt - startedAt`, in ms. */
  duration: { mean: number; max: number };
}

/** One test case execution, as `executions` lists it. */
export interface ExecutionSummary {
  executionId: string;
  testCase: string;
  /** When its first container run started, as an ISO timestamp. */
  ranAt: string;
  /** How many container runs are recorded for it. */
  containerRuns: number;
}

export interface RunDataStore {
  recordContainerRun(record: ContainerRunRecord): Promise<void>;
  /**
   * Merges `measures` into the result of the container run recorded with `postrunImage`,
   * replacing any measure of the same name and leaving the others. Throws if no such run is
   * recorded.
   */
  recordMeasures(postrunImage: string, measures: Result): Promise<void>;
  /** Recorded executions, newest first; only `testCase`'s if given. */
  listExecutions(testCase?: string): Promise<ExecutionSummary[]>;
  /**
   * Every container run recorded for `executionId`, by permutation in matrix order, then by
   * iteration. Empty if there are none.
   */
  getExecution(executionId: string): Promise<ContainerRunRecord[]>;
  /** The container run recorded with `postrunImage`, if there is one. */
  getContainerRun(postrunImage: string): Promise<ContainerRunRecord | undefined>;
  /** Stores `result`, replacing any stored for the same execution and permutation. */
  recordAggregationResult(result: AggregationResult): Promise<void>;
  /** The aggregation results stored for `executionId`, in matrix order. Empty if there are none. */
  getAggregationResults(executionId: string): Promise<AggregationResult[]>;
}

/** Where the store lives under the `.thunderjar/` folder `root`. */
export const defaultRunDataStorePath = (root: string) => join(root, ".data", "runs.json");

interface JsonFile {
  containerRuns: ContainerRunRecord[];
  /** Absent from a file written before aggregation results were stored. */
  aggregationResults?: AggregationResult[];
}

/** Groups records by execution ID, newest first. */
export function summarizeExecutions(records: ContainerRunRecord[]): ExecutionSummary[] {
  const byId = new Map<string, ExecutionSummary>();
  for (const { executionId, testCase, ranAt } of records) {
    const summary = byId.get(executionId);
    if (!summary) byId.set(executionId, { executionId, testCase, ranAt, containerRuns: 1 });
    else {
      summary.containerRuns++;
      if (ranAt < summary.ranAt) summary.ranAt = ranAt;
    }
  }
  // ISO timestamps sort as strings, and so do ULIDs, which settle ties.
  const newestFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  return [...byId.values()].toSorted(
    (a, b) => newestFirst(a.ranAt, b.ranAt) || newestFirst(a.executionId, b.executionId),
  );
}

/**
 * One execution's records by permutation, then by iteration. Records don't hold a permutation's
 * place in the matrix, but `run` records permutations in matrix order, so the order each was
 * first recorded in stands for it.
 */
export function inExecutionOrder(records: ContainerRunRecord[]): ContainerRunRecord[] {
  const place = matrixPlaces(records);
  return records.toSorted(
    (a, b) => place.get(a.permutationHash)! - place.get(b.permutationHash)! || a.iteration - b.iteration,
  );
}

/** Each permutation's place in one execution's matrix, as the order its first run was recorded in. */
function matrixPlaces(records: ContainerRunRecord[]): Map<string, number> {
  const place = new Map<string, number>();
  for (const { permutationHash } of records) if (!place.has(permutationHash)) place.set(permutationHash, place.size);
  return place;
}

/**
 * A store kept in one JSON file at `path`. A missing file is an empty store. Each write
 * replaces the file whole, via a temporary file renamed over it, so an interrupted write
 * leaves the previous contents rather than half a file.
 */
export function jsonFileStore(path: string): RunDataStore {
  const read = async (): Promise<JsonFile> => {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { containerRuns: [] };
      throw error;
    }
    return JSON.parse(text) as JsonFile;
  };

  const write = async (data: JsonFile) => {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
    await rename(temp, path);
  };

  return {
    async recordContainerRun(record) {
      const data = await read();
      data.containerRuns.push(record);
      await write(data);
    },
    async recordMeasures(postrunImage, measures) {
      const data = await read();
      const record = data.containerRuns.find((r) => r.postrunImage === postrunImage);
      if (!record) throw new Error(`no container run recorded for ${postrunImage}`);
      record.result = { ...record.result, ...measures };
      await write(data);
    },
    async listExecutions(testCase) {
      const { containerRuns } = await read();
      return summarizeExecutions(testCase === undefined ? containerRuns : containerRuns.filter((r) => r.testCase === testCase));
    },
    async getExecution(executionId) {
      const { containerRuns } = await read();
      return inExecutionOrder(containerRuns.filter((r) => r.executionId === executionId));
    },
    async getContainerRun(postrunImage) {
      const { containerRuns } = await read();
      return containerRuns.find((r) => r.postrunImage === postrunImage);
    },
    async recordAggregationResult(result) {
      const data = await read();
      const results = (data.aggregationResults ??= []);
      const same = results.findIndex(
        (r) => r.executionId === result.executionId && r.permutationHash === result.permutationHash,
      );
      if (same === -1) results.push(result);
      else results[same] = result;
      await write(data);
    },
    async getAggregationResults(executionId) {
      const { containerRuns, aggregationResults = [] } = await read();
      const place = matrixPlaces(containerRuns.filter((r) => r.executionId === executionId));
      // A result with no recorded runs has no place in the matrix, so it goes last.
      const placeOf = ({ permutationHash }: AggregationResult) => place.get(permutationHash) ?? place.size;
      return aggregationResults.filter((r) => r.executionId === executionId).toSorted((a, b) => placeOf(a) - placeOf(b));
    },
  };
}
