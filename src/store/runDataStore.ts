// The run data store: what each execution did, and each of its container runs, behind a small
// interface with two implementations, named by the config's `runDataStore`:
//
//   sqliteStore    a local SQLite file, by `bun:sqlite`; by default `.thunderjar/.data/runs.sqlite`,
//                  which `init` gitignores, or `runs.sqlite` in `--data-dir`
//   postgresStore  a shared Postgres database, by `Bun.sql`, so CI and developers see the same runs
//
// Both have the same two tables (Postgres's prefixed `thunderjar_`):
//
//   executions      (execution_id PRIMARY KEY, record)                      its ExecutionRecord
//   container_runs  (execution_id, permutation, iteration PRIMARY KEY, record)  a ContainerRunRecord each
//
// Each record is a JSON column, so a record's shape can grow without a migration, e.g. a
// container run's `postrunPurge`, which older records simply don't have; the keys
// beside it are only for lookups and order. Each write is one statement, so it's atomic.
// Reads open the file read-only, so reading never creates or changes it.
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import type { Reply, Resolved, TokenCosts } from "../api/declarations.ts";
import type { Overrides } from "../config/overrides.ts";
import type { Axis } from "../config/permutations.ts";
import { moduleLogger } from "../log/logger.ts";

const log = moduleLogger("store");

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
  /**
   * The lists, and iterations, given on the command line in place of the test case's own, so it
   * wasn't the test case as written. Absent if none were, and from executions recorded before they could be.
   */
  overrides?: Overrides;
};

/** How the agent ran, from the run script's /thunderjar/run.json. */
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
   * Why its container never started, if it didn't: then the agent never ran, `startedAt` and
   * `finishedAt` are when Thunderjar started `docker run` and gave up on it, and its exit code is null.
   */
  failedToStart?: string;
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
  /**
   * Its harness folder, the version that harness pins, and the model ID it was given. `model` is
   * the model's name in runs recorded before pairs named model IDs, `<harness>@<version>/<model>`.
   */
  harnessModel: { harness: string; version: string; modelId: string; model?: string };
  /** Its test case's `env`, the variables its agent container was given, with their values. Absent if it gave none, and from runs recorded before test cases could. */
  env?: Record<string, string>;
  /** The names of its test case's `secretEnv`, never their values. Absent if it gave none, and from runs recorded before test cases could. */
  secretEnv?: string[];
  /**
   * The names of the variables its harness's `requiredEnv` gave its agent, never their values: of
   * a `{ oneOf }`, the one that was set, e.g. whether it ran on a subscription token or an API key.
   * Absent if it gave none, and from runs recorded before they were.
   */
  harnessEnv?: string[];
  execution: Execution;
  /** The text of the result file the harness's `cli` left, or null if it left none. */
  harnessResult: string | null;
  /**
   * The tail of the run script's stderr, or null if it left none: it never ran. Absent from runs
   * recorded before stderr was.
   */
  harnessStderr?: string | null;
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
   * Each turn's result file, stderr and reply, of an initial prompt of several turns.
   * `harnessResult`, `harnessStderr` and `reply` are its last turn's. Absent for a single prompt.
   */
  turns?: { harnessResult: string | null; harnessStderr?: string | null; reply: Reply }[];
  /** The run's measures, by measurement name. Empty until it has been measured. */
  result: Record<string, RecordedMeasure>;
  /**
   * Its measures before each `remeasure`, oldest first: `result` is always the latest. Absent if it
   * was never remeasured.
   */
  earlierResults?: Record<string, RecordedMeasure>[];
  /**
   * That its postrun image was deleted, so `postrunImage` names an image that may no longer exist.
   * Its measures stay valid; they just can't be retaken. Absent if it never was.
   */
  postrunPurge?: PostrunPurge;
  /**
   * The run's secret variables whose values were found in files of its postrun image, by name,
   * never value. Absent if none was, and from runs recorded before they were looked for.
   */
  secretsFound?: FoundSecret[];
  /** Why its postrun image's files couldn't be searched for its secret values, if they couldn't: it may hold one. */
  secretSearchFailed?: string;
};

/** Where a postrun image was deleted from: the local Docker daemon, the image store's registry, or both. */
export type PurgedFrom = "daemon" | "imageStore" | "both";

/** When, and where from, a container run's postrun image was deleted, and why. */
export type PostrunPurge = {
  /** ISO timestamp of when it was deleted. */
  purgedAt: string;
  from: PurgedFrom;
  reason?: string;
};

/** A container run of an execution, by its place in the matrix. */
export type RunKey = { permutation: number; iteration: number };

/**
 * `next` marked on a run already purged as `previous`: the earlier time, every place it was
 * deleted from, and `next`'s reason, or else `previous`'s. So marking again is harmless.
 */
export function mergePurge(previous: PostrunPurge | undefined, next: PostrunPurge): PostrunPurge {
  if (previous === undefined) return next;
  const from = previous.from === next.from ? next.from : "both";
  const purgedAt = previous.purgedAt < next.purgedAt ? previous.purgedAt : next.purgedAt;
  const reason = next.reason ?? previous.reason;
  return { purgedAt, from, ...(reason === undefined ? {} : { reason }) };
}

/** `runs`, or only those `only` names if given, each marked with `purge`. */
function markedRuns(runs: ContainerRunRecord[], purge: PostrunPurge, only?: readonly RunKey[]): ContainerRunRecord[] {
  const chosen = only === undefined ? runs : runs.filter((run) => only.some((key) => key.permutation === run.permutation && key.iteration === run.iteration));
  return chosen.map((run) => ({ ...run, postrunPurge: mergePurge(run.postrunPurge, purge) }));
}

/** A secret found in a postrun image's files: its variable's name, how many files hold it, and the first of their paths. */
export type FoundSecret = { name: string; files: number; paths: string[] };

export interface RunDataStore {
  /** Records `record`, replacing any recorded for the same execution. */
  recordExecution(record: ExecutionRecord): Promise<void>;
  /** Records `record`, replacing any recorded for the same container run. */
  recordContainerRun(record: ContainerRunRecord): Promise<void>;
  /** Every execution recorded, newest first. */
  listExecutions(): Promise<ExecutionRecord[]>;
  /** The container runs recorded for `executionId`, by permutation then iteration. Empty if none. */
  containerRunsOf(executionId: string): Promise<ContainerRunRecord[]>;
  /**
   * Marks the postrun images of `executionId`'s container runs as purged, or only of those `runs`
   * names if given, and returns the records as marked, by permutation then iteration. Marking a
   * run again merges the two purges (see mergePurge), so it's harmless. Runs not recorded are ignored.
   */
  markPostrunsPurged(executionId: string, purge: PostrunPurge, runs?: readonly RunKey[]): Promise<ContainerRunRecord[]>;
  /**
   * Checks the store can be used, so a run finds out before it builds or runs anything, not as
   * its first container run is recorded. Throws a RunDataStoreError if a database can't be
   * reached, or an existing file isn't a store. A missing file is fine: the first write creates it.
   */
  check(): Promise<void>;
}

/** The file of the store in `dataDir`, a `--data-dir`. */
export const storeFileIn = (dataDir: string) => `${dataDir}/runs.sqlite`;

/** A store, or a record in it, that can't be read or written: at `path`, a file, or a description of a database. */
export class RunDataStoreError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.path = path;
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS executions (
    execution_id TEXT PRIMARY KEY,
    record TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS container_runs (
    execution_id TEXT NOT NULL,
    permutation INTEGER NOT NULL,
    iteration INTEGER NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (execution_id, permutation, iteration)
  );
`;

/**
 * The SQLite store in the file at `path`. Reading a missing file is an empty store, and doesn't
 * create it; the first write creates it, and its folder. Throws a RunDataStoreError for a file
 * that isn't a store, or a record that isn't JSON.
 */
export function sqliteStore(path: string): RunDataStore {
  let writer: Database | undefined;

  const fail = (error: unknown, what?: string): never => {
    const message = error instanceof Error ? error.message : String(error);
    throw new RunDataStoreError(path, what === undefined ? message : `${what}: ${message}`);
  };

  /** The store, opened to write, created with its folder if it doesn't exist. */
  const forWriting = async (): Promise<Database> => {
    if (writer) return writer;
    await Bun.$`mkdir -p ${path.slice(0, path.lastIndexOf("/")) || "/"}`.quiet();
    try {
      const db = new Database(path, { create: true, strict: true });
      db.exec(SCHEMA);
      writer = db;
      return db;
    } catch (error) {
      return fail(error);
    }
  };

  /** The rows of `sql`, read-only, or none if there's no store yet. Never writes the file. */
  const read = async <T>(sql: string, params: Record<string, string> = {}): Promise<T[]> => {
    if (!writer && !(await Bun.file(path).exists())) return [];
    let db: Database | undefined;
    try {
      db = writer ?? new Database(path, { readonly: true, strict: true });
      return db.query(sql).all(params) as T[];
    } catch (error) {
      return fail(error);
    } finally {
      if (db && db !== writer) db.close();
    }
  };

  const parse = <T>(what: string, record: string): T => {
    try {
      return JSON.parse(record) as T;
    } catch (error) {
      return fail(error, what);
    }
  };

  return {
    async recordExecution(record) {
      (await forWriting())
        .query("INSERT OR REPLACE INTO executions (execution_id, record) VALUES ($id, $record)")
        .run({ id: record.executionId, record: JSON.stringify(record) });
    },
    async recordContainerRun(record) {
      (await forWriting())
        .query(
          "INSERT OR REPLACE INTO container_runs (execution_id, permutation, iteration, record) VALUES ($id, $permutation, $iteration, $record)",
        )
        .run({ id: record.executionId, permutation: record.permutation, iteration: record.iteration, record: JSON.stringify(record) });
    },
    async check() {
      await read("SELECT 1 FROM executions LIMIT 1");
    },
    async listExecutions() {
      // ULIDs sort by time.
      const rows = await read<{ execution_id: string; record: string }>("SELECT execution_id, record FROM executions ORDER BY execution_id DESC");
      return rows.map((row) => parse<ExecutionRecord>(`execution ${row.execution_id}`, row.record));
    },
    async containerRunsOf(executionId) {
      const rows = await read<{ permutation: number; iteration: number; record: string }>(
        "SELECT permutation, iteration, record FROM container_runs WHERE execution_id = $id ORDER BY permutation, iteration",
        { id: executionId },
      );
      return rows.map((row) => parse<ContainerRunRecord>(`container run ${executionId} ${row.permutation}-${row.iteration}`, row.record));
    },
    async markPostrunsPurged(executionId, purge, runs) {
      // No file is no runs to mark: don't create one.
      if (!writer && !(await Bun.file(path).exists())) return [];
      const db = await forWriting();
      const select = db.query("SELECT permutation, iteration, record FROM container_runs WHERE execution_id = $id ORDER BY permutation, iteration");
      const update = db.query("UPDATE container_runs SET record = $record WHERE execution_id = $id AND permutation = $permutation AND iteration = $iteration");
      // Read and rewritten in one transaction, so a run recorded meanwhile isn't overwritten.
      return db.transaction(() => {
        const rows = select.all({ id: executionId }) as { permutation: number; iteration: number; record: string }[];
        const records = rows.map((row) => parse<ContainerRunRecord>(`container run ${executionId} ${row.permutation}-${row.iteration}`, row.record));
        const marked = markedRuns(records, purge, runs);
        for (const run of marked) update.run({ id: executionId, permutation: run.permutation, iteration: run.iteration, record: JSON.stringify(run) });
        return marked;
      })();
    },
  };
}

const POSTGRES_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS thunderjar_executions (execution_id TEXT PRIMARY KEY, record JSONB NOT NULL)",
  `CREATE TABLE IF NOT EXISTS thunderjar_container_runs (
    execution_id TEXT NOT NULL,
    permutation INTEGER NOT NULL,
    iteration INTEGER NOT NULL,
    record JSONB NOT NULL,
    PRIMARY KEY (execution_id, permutation, iteration)
  )`,
];

/**
 * The Postgres store at `url`, named `label` in errors, e.g. `Postgres at $THUNDERJAR_DB_URL`, so
 * the URL and its password are never printed. Its tables, prefixed `thunderjar_` to share a
 * database, are created on first use. Throws a RunDataStoreError if the database can't be reached,
 * after trying again once for each of `retryDelaysMs`.
 */
export type PostgresStoreOptions = {
  /** How long to wait before each retry of a query that failed. */
  retryDelaysMs?: readonly number[];
};

export function postgresStore(url: string, label: string, { retryDelaysMs = [500, 2000] }: PostgresStoreOptions = {}): RunDataStore {
  // A short idle timeout, so a command's process can exit once its queries are done.
  const sql = new SQL(url, { max: 4, idleTimeout: 1 });
  let ready: Promise<void> | undefined;

  /**
   * Runs `query` once the tables exist. A query that fails is tried again, after each of
   * `retryDelaysMs`, since a pooled connection to a shared database drops now and then, and every
   * query here can be repeated: the writes are upserts. One lost write would otherwise fail a
   * whole execution, after its agents had run.
   */
  const run = async <T>(query: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        ready ??= (async () => {
          for (const statement of POSTGRES_SCHEMA) await sql.unsafe(statement);
        })();
        await ready;
        return await query();
      } catch (error) {
        ready = undefined;
        const message = error instanceof Error ? error.message : String(error);
        const delay = retryDelaysMs[attempt];
        if (delay === undefined) throw new RunDataStoreError(label, message);
        log.warn({ store: label, attempt: attempt + 1, retryInMs: delay, error: message }, "run data store query failed, retrying");
        await Bun.sleep(delay);
      }
    }
  };

  return {
    async check() {
      await run(async () => {});
    },
    async recordExecution(record) {
      await run(
        () => sql`INSERT INTO thunderjar_executions (execution_id, record) VALUES (${record.executionId}, ${record})
          ON CONFLICT (execution_id) DO UPDATE SET record = EXCLUDED.record`,
      );
    },
    async recordContainerRun(record) {
      await run(
        () => sql`INSERT INTO thunderjar_container_runs (execution_id, permutation, iteration, record)
          VALUES (${record.executionId}, ${record.permutation}, ${record.iteration}, ${record})
          ON CONFLICT (execution_id, permutation, iteration) DO UPDATE SET record = EXCLUDED.record`,
      );
    },
    async listExecutions() {
      // ULIDs sort by time.
      const rows = await run(() => sql`SELECT record FROM thunderjar_executions ORDER BY execution_id DESC`);
      return (rows as { record: ExecutionRecord }[]).map((row) => row.record);
    },
    async containerRunsOf(executionId) {
      const rows = await run(
        () => sql`SELECT record FROM thunderjar_container_runs WHERE execution_id = ${executionId} ORDER BY permutation, iteration`,
      );
      return (rows as { record: ContainerRunRecord }[]).map((row) => row.record);
    },
    async markPostrunsPurged(executionId, purge, runs) {
      // Read, locked, and rewritten in one transaction, so a run recorded meanwhile isn't overwritten.
      return run(() =>
        sql.begin(async (tx) => {
          const rows = (await tx`SELECT record FROM thunderjar_container_runs WHERE execution_id = ${executionId}
            ORDER BY permutation, iteration FOR UPDATE`) as { record: ContainerRunRecord }[];
          const marked = markedRuns(
            rows.map((row) => row.record),
            purge,
            runs,
          );
          for (const record of marked) {
            await tx`UPDATE thunderjar_container_runs SET record = ${record}
              WHERE execution_id = ${executionId} AND permutation = ${record.permutation} AND iteration = ${record.iteration}`;
          }
          return marked;
        }),
      );
    },
  };
}
