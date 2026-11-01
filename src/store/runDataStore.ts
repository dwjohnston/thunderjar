// The run data store: what each execution did, and each of its container runs. A small
// interface, so another store (SQLite, a shared remote one) can drop in behind it. For now the
// only store is a folder of JSON files, under `--data-dir`, by default `.thunderjar/.data/`,
// which `init` gitignores; the config's `runDataStore` isn't read yet.
//
//   <data dir>/runs/<execution ID>/
//     execution.json                                   its ExecutionRecord
//     container-runs/<permutation>-<iteration>.json    a ContainerRunRecord each
//
// Every file is pretty JSON, written whole to a temporary file then renamed over the old one,
// so an interrupted write leaves the previous contents rather than half a file.
import { $, Glob } from "bun";
import type { Axis } from "../config/permutations.ts";

/** `running` until its last container run finishes, or if it was interrupted. */
export type ExecutionStatus = "running" | "complete" | "failed";

/** One execution of a test case. */
export type ExecutionRecord = {
  /** A ULID. */
  executionId: string;
  testCase: string;
  task: string;
  /** ISO timestamp of when it started running, once its prerun images were built. */
  startedAt: string;
  /** ISO timestamp of when it ended; absent while it's running. */
  finishedAt?: string;
  /** `failed` if any container run's agent exited non-zero, or the execution stopped on an error. */
  status: ExecutionStatus;
  matrix: {
    /** The size of each axis, in AXES order. */
    shape: number[];
    permutations: number;
    iterations: number;
  };
};

/** How the agent ran, from the execution wrapper's /thunderjar/run.json. */
export type Execution = {
  /** Epoch ms, harness start. */
  startedAt: number;
  /** Epoch ms, harness exit. */
  finishedAt: number;
  exitCode: number;
};

/** One container run: one iteration of one permutation. */
export type ContainerRunRecord = {
  executionId: string;
  testCase: string;
  task: string;
  /** The permutation's place in the matrix, counting from 1. */
  permutation: number;
  /** Full and untruncated; the copy in the prerun image's tag is abbreviated. */
  permutationHash: string;
  /** Counts from 1. */
  iteration: number;
  /** So the artifact is reachable from the record. */
  postrunImage: string;
  /** ISO timestamp of when the agent started. */
  ranAt: string;
  /** Each parameter, by name and parameter hash. */
  parameters: Record<Axis, { name: string; parameterHash: string }>;
  harnessModel: { harness: string; version: string; model: string; modelId: string };
  execution: Execution;
  /** The text of the result file the harness's `cli` left, or null if it left none. */
  harnessResult: string | null;
  /** The run's measures, by measurement name. */
  result: Record<string, unknown>;
};

export interface RunDataStore {
  /** Records `record`, replacing any recorded for the same execution. */
  recordExecution(record: ExecutionRecord): Promise<void>;
  /** Records `record`, replacing any recorded for the same container run. */
  recordContainerRun(record: ContainerRunRecord): Promise<void>;
  /** Every execution recorded, newest first. */
  listExecutions(): Promise<ExecutionRecord[]>;
  /** The container runs recorded for `executionId`, by permutation then iteration. Empty if none. */
  containerRunsOf(executionId: string): Promise<ContainerRunRecord[]>;
}

/** The folder of execution `executionId`'s records, in the store under `dataDir`. */
export const executionFolder = (dataDir: string, executionId: string) => `${dataDir}/runs/${executionId}`;

async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await $`mv ${temporary} ${path}`.quiet();
}

/** A record in the store that can't be read, at `path`. */
export class RunDataStoreError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.path = path;
  }
}

/** Each file in `dir` matching `pattern`, parsed. None if `dir` doesn't exist. Throws a RunDataStoreError for a file that isn't JSON. */
async function readJsonFiles<T>(dir: string, pattern: string): Promise<T[]> {
  const isDirectory = await Bun.file(dir)
    .stat()
    .then((stat) => stat.isDirectory())
    .catch(() => false);
  if (!isDirectory) return [];
  const files = await Array.fromAsync(new Glob(pattern).scan({ cwd: dir }));
  return Promise.all(
    files.map(async (file) => {
      const path = `${dir}/${file}`;
      try {
        return (await Bun.file(path).json()) as T;
      } catch (error) {
        throw new RunDataStoreError(path, error instanceof Error ? error.message : String(error));
      }
    }),
  );
}

/** A store of JSON files under `dataDir`. A missing folder is an empty store. */
export function fileStore(dataDir: string): RunDataStore {
  return {
    async recordExecution(record) {
      await writeJson(`${executionFolder(dataDir, record.executionId)}/execution.json`, record);
    },
    async recordContainerRun(record) {
      const dir = `${executionFolder(dataDir, record.executionId)}/container-runs`;
      await writeJson(`${dir}/${record.permutation}-${record.iteration}.json`, record);
    },
    async listExecutions() {
      const records = await readJsonFiles<ExecutionRecord>(`${dataDir}/runs`, "*/execution.json");
      // ULIDs sort by time.
      return records.toSorted((a, b) => (a.executionId < b.executionId ? 1 : a.executionId > b.executionId ? -1 : 0));
    },
    async containerRunsOf(executionId) {
      const records = await readJsonFiles<ContainerRunRecord>(`${executionFolder(dataDir, executionId)}/container-runs`, "*.json");
      return records.toSorted((a, b) => a.permutation - b.permutation || a.iteration - b.iteration);
    },
  };
}
