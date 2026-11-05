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
import type { Reply, Resolved, TokenCosts } from "../api/declarations.ts";
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
  /** Epoch ms, harness exit, or when it was killed if it timed out. */
  finishedAt: number;
  /** Null if it never exited: it timed out, and was killed. */
  exitCode: number | null;
  /** Whether it was still running after `timeoutSeconds`, and was killed. Absent from runs recorded before timeouts were. */
  timedOut?: boolean;
  /** Its initial prompt's limit, in seconds. Absent from runs recorded before timeouts were. */
  timeoutSeconds?: number;
  /**
   * How each turn ran, of an initial prompt of several turns: those that ran, which stop at the
   * first that exited non-zero. Absent for a single prompt.
   */
  turns?: { startedAt: number; finishedAt: number; exitCode: number }[];
};

/** A MeasurementResult as the store keeps it: an error by its message. */
export type RecordedOutcome =
  | { outcome: "measured"; data: unknown }
  | { outcome: "skipped"; reason?: string }
  | { outcome: "erroredWhileMeasuring"; error: { message: string } };

/** One measure of a container run. */
export type RecordedMeasure = {
  instrument: string;
  /** Of the measurement that took it; a measure whose hash differs from its measurement's now is stale. */
  contentHash: string;
  /** ISO timestamp of when it was taken, not of when the container run ran. */
  measuredAt: string;
  outcome: RecordedOutcome;
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
  /**
   * Each parameter, by name and parameter hash, and, for one with a `resolve`, what it resolved
   * to for this run's execution.
   */
  parameters: Record<Axis, { name: string; parameterHash: string; resolved?: Resolved }>;
  harnessModel: { harness: string; version: string; model: string; modelId: string };
  execution: Execution;
  /** The text of the result file the harness's `cli` left, or null if it left none. */
  harnessResult: string | null;
  /** The agent's final reply, read from the result file by its harness's `collectReply`, or why there's none. Absent from runs recorded before replies were. */
  reply?: Reply;
  /**
   * Its tokens and cost per model, read from its result files by its harness's
   * `collectTokenCosts`, summed across turns, or why there are none. Absent from runs recorded
   * before token costs were.
   */
  tokenCosts?: TokenCosts;
  /** The session ID its turns shared. Absent from runs recorded before sessions were. */
  sessionId?: string;
  /**
   * Each turn's result file and reply, of an initial prompt of several turns. `harnessResult` and
   * `reply` are its last turn's. Absent for a single prompt.
   */
  turns?: { harnessResult: string | null; reply: Reply }[];
  /** The run's measures, by measurement name. Empty until it has been measured. */
  result: Record<string, RecordedMeasure>;
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
