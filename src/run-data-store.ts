// The run data store — spec/085-test-case-results.md#what-gets-written-to-the-run-data-store
// and spec/050-setup-and-configure.md#thunderjarconfigts. A small interface, so a later store
// (SQLite, a shared remote one) drops in behind it without changing anything above it. For
// now the only store is a JSON file under `.thunderjar/.data/`, which `init` gitignores; the
// config's `runDataStore` entry isn't read yet.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Axis } from "./resolve.ts";

/** One measure in a container run's result, keyed by measurement name. Measures come later. */
export interface RecordedMeasure {
  instrument: string;
  /** Of the measurement that produced this measure. */
  contentHash: string;
  /** When it was measured — not when the container run happened. */
  measuredAt: string;
  outcome: unknown;
}

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
  /** Recorded executions, newest first; only `testCase`'s if given. */
  listExecutions(testCase?: string): Promise<ExecutionSummary[]>;
}

/** Where the store lives under the `.thunderjar/` folder `root`. */
export const defaultRunDataStorePath = (root: string) => join(root, ".data", "runs.json");

interface JsonFile {
  containerRuns: ContainerRunRecord[];
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

  return {
    async recordContainerRun(record) {
      const data = await read();
      data.containerRuns.push(record);
      await mkdir(dirname(path), { recursive: true });
      const temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
      await rename(temp, path);
    },
    async listExecutions(testCase) {
      const { containerRuns } = await read();
      return summarizeExecutions(testCase === undefined ? containerRuns : containerRuns.filter((r) => r.testCase === testCase));
    },
  };
}
