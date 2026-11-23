import { $ } from "bun";
import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { TMP_DIR } from "../testing/cli.ts";
import { SQL } from "bun";
import {
  type ContainerRunRecord,
  type ExecutionRecord,
  mergePurge,
  type PostrunPurge,
  postgresStore,
  setupPostgres,
  RunDataStoreError,
  sqliteStore,
  storeFileIn,
} from "./runDataStore.ts";

const dirs: string[] = [];
const dataDir = () => {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

const execution = (executionId: string, status: ExecutionRecord["status"] = "complete"): ExecutionRecord => ({
  executionId,
  testCase: "two-harnesses",
  task: "is-prime",
  startedAt: "2026-11-01T02:00:00.000Z",
  finishedAt: "2026-11-01T02:01:00.000Z",
  status,
  matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 1 },
});

const containerRun = (executionId: string, permutation: number, iteration: number): ContainerRunRecord => ({
  executionId,
  testCase: "two-harnesses",
  task: "is-prime",
  permutation,
  permutationHash: `${permutation}`.repeat(64),
  iteration,
  postrunImage: `thunderjar-postrun:${executionId}-${permutation}-${iteration}`,
  ranAt: "2026-11-01T02:00:00.000Z",
  parameters: {
    baseImage: { name: "node20", parameterHash: "a".repeat(64) },
    codeState: { name: "baseline", parameterHash: "b".repeat(64) },
    promptSet: { name: "snerk", parameterHash: "c".repeat(64) },
    harnessModel: { name: "fake-harness-alpha@1.0.0/fake-model-small", parameterHash: "d".repeat(64) },
    initialPrompt: { name: "plain", parameterHash: "e".repeat(64) },
  },
  harnessModel: { harness: "fake-harness-alpha", version: "1.0.0", model: "fake-model-small", modelId: "fake-model-small-001" },
  execution: { startedAt: 1793498400000, finishedAt: 1793498400250, exitCode: 0 },
  harnessResult: '{"model":"fake-model-small-001"}\n',
  result: {},
});

const PURGE: PostrunPurge = { purgedAt: "2026-11-19T09:00:00.000Z", from: "imageStore", reason: "held leaked keys" };

describe("mergePurge", () => {
  test("a run not purged before takes the purge as it is", () => {
    expect(mergePurge(undefined, PURGE)).toEqual(PURGE);
  });

  test("a run purged before keeps the earlier time, every place, and the newer reason, or else the older", () => {
    const later = { purgedAt: "2026-11-20T00:00:00.000Z", from: "daemon" } as const;
    expect(mergePurge(PURGE, later)).toEqual({ purgedAt: PURGE.purgedAt, from: "both", reason: "held leaked keys" });
    expect(mergePurge(later, PURGE)).toEqual({ ...PURGE, from: "both" });
    expect(mergePurge(PURGE, { ...PURGE, reason: "again" })).toEqual({ ...PURGE, reason: "again" });
    expect(mergePurge({ ...PURGE, from: "both" }, PURGE)).toEqual({ ...PURGE, from: "both" });
  });
});

const errorOf = (error: unknown) => (error instanceof RunDataStoreError ? { path: error.path, message: error.message } : error);

describe("sqliteStore", () => {
  test("a missing file is an empty store, and reading doesn't create it", async () => {
    const file = storeFileIn(dataDir());
    const store = sqliteStore(file);

    expect(await store.listExecutions()).toEqual([]);
    expect(await store.containerRunsOf("01kxxxxxxxxxxxxxxxxxxxxxxx")).toEqual([]);
    expect(await Bun.file(file).exists()).toBe(false);
  });

  test("the first write creates the file, and its folder; another store of the file reads what was written", async () => {
    const file = `${dataDir()}/nested/runs.sqlite`;
    const store = sqliteStore(file);
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";

    await store.recordExecution(execution(id));
    await store.recordContainerRun(containerRun(id, 1, 1));
    await store.recordContainerRun(containerRun(id, 2, 1));

    const reopened = sqliteStore(file);
    expect(await reopened.listExecutions()).toEqual([execution(id)]);
    expect(await reopened.containerRunsOf(id)).toEqual([containerRun(id, 1, 1), containerRun(id, 2, 1)]);
  });

  test("recording an execution or a container run again replaces its record", async () => {
    const store = sqliteStore(storeFileIn(dataDir()));
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";

    await store.recordExecution(execution(id, "running"));
    await store.recordExecution(execution(id, "failed"));
    await store.recordContainerRun(containerRun(id, 1, 1));
    await store.recordContainerRun({ ...containerRun(id, 1, 1), postrunImage: "again" });

    expect(await store.listExecutions()).toEqual([execution(id, "failed")]);
    expect((await store.containerRunsOf(id)).map((record) => record.postrunImage)).toEqual(["again"]);
  });

  test("lists executions newest first", async () => {
    const store = sqliteStore(storeFileIn(dataDir()));

    await store.recordExecution(execution("01kfa1bgz0bbbbbbbbbbbbbbbb"));
    await store.recordExecution(execution("01kfa1bgz1aaaaaaaaaaaaaaaa"));
    await store.recordExecution(execution("01kfa1bgz0aaaaaaaaaaaaaaaa"));

    expect((await store.listExecutions()).map((record) => record.executionId)).toEqual([
      "01kfa1bgz1aaaaaaaaaaaaaaaa",
      "01kfa1bgz0bbbbbbbbbbbbbbbb",
      "01kfa1bgz0aaaaaaaaaaaaaaaa",
    ]);
  });

  test("gives an execution's container runs by permutation, then iteration, and only its own", async () => {
    const store = sqliteStore(storeFileIn(dataDir()));
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    const other = "01kfa1bgz0bbbbbbbbbbbbbbbb";

    for (const [p, i] of [[10, 1], [2, 2], [2, 1], [1, 10], [1, 2]] as const) await store.recordContainerRun(containerRun(id, p, i));
    await store.recordContainerRun(containerRun(other, 1, 1));

    expect((await store.containerRunsOf(id)).map((record) => [record.permutation, record.iteration])).toEqual([
      [1, 2],
      [1, 10],
      [2, 1],
      [2, 2],
      [10, 1],
    ]);
  });

  test("a record that isn't JSON is a RunDataStoreError naming the file and the record", async () => {
    const file = storeFileIn(dataDir());
    const store = sqliteStore(file);
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    await store.recordExecution(execution(id));
    await store.recordContainerRun(containerRun(id, 1, 1));
    const db = new Database(file);
    db.exec("UPDATE executions SET record = '{'; UPDATE container_runs SET record = '';");
    db.close();

    expect(await sqliteStore(file).listExecutions().catch(errorOf)).toEqual({ path: file, message: expect.stringMatching(new RegExp(`^execution ${id}: `)) });
    expect(await sqliteStore(file).containerRunsOf(id).catch(errorOf)).toEqual({ path: file, message: expect.stringMatching(new RegExp(`^container run ${id} 1-1: `)) });
  });

  test("marks an execution's postrun images purged, all or only some, leaving other executions and the rest of each record as they were", async () => {
    const file = storeFileIn(dataDir());
    const store = sqliteStore(file);
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    const other = "01kfa1bgz0bbbbbbbbbbbbbbbb";
    for (const [p, i] of [[1, 1], [1, 2], [2, 1]] as const) await store.recordContainerRun(containerRun(id, p, i));
    await store.recordContainerRun(containerRun(other, 1, 1));

    const some = await store.markPostrunsPurged(id, PURGE, [{ permutation: 1, iteration: 2 }, { permutation: 9, iteration: 9 }]);
    expect(some).toEqual([{ ...containerRun(id, 1, 2), postrunPurge: PURGE }]);
    expect((await sqliteStore(file).containerRunsOf(id)).map((run) => run.postrunPurge)).toEqual([undefined, PURGE, undefined]);

    expect(await store.markPostrunsPurged(id, PURGE)).toHaveLength(3);
    expect(await sqliteStore(file).containerRunsOf(id)).toEqual([[1, 1], [1, 2], [2, 1]].map(([p, i]) => ({ ...containerRun(id, p!, i!), postrunPurge: PURGE })));
    expect(await store.containerRunsOf(other)).toEqual([containerRun(other, 1, 1)]);
  });

  test("marking runs purged again is harmless: the purges merge", async () => {
    const store = sqliteStore(storeFileIn(dataDir()));
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    await store.recordContainerRun(containerRun(id, 1, 1));

    await store.markPostrunsPurged(id, PURGE);
    await store.markPostrunsPurged(id, PURGE);
    expect((await store.containerRunsOf(id))[0]!.postrunPurge).toEqual(PURGE);

    await store.markPostrunsPurged(id, { purgedAt: "2026-11-20T00:00:00.000Z", from: "daemon" });
    expect((await store.containerRunsOf(id))[0]!.postrunPurge).toEqual({ ...PURGE, from: "both" });
  });

  test("marking runs purged in a missing file marks none, and doesn't create it", async () => {
    const file = storeFileIn(dataDir());

    expect(await sqliteStore(file).markPostrunsPurged("01kfa1bgz0aaaaaaaaaaaaaaaa", PURGE)).toEqual([]);
    expect(await Bun.file(file).exists()).toBe(false);
  });

  test("a file that isn't a store is a RunDataStoreError naming it", async () => {
    const file = storeFileIn(dataDir());
    await Bun.write(file, "not a database, just some text that is long enough to be a header and more");

    expect(await sqliteStore(file).listExecutions().catch(errorOf)).toEqual({ path: file, message: expect.any(String) });
    expect(await sqliteStore(file).recordExecution(execution("01kfa1bgz0aaaaaaaaaaaaaaaa")).catch(errorOf)).toEqual({ path: file, message: expect.any(String) });
  });
});

// Against a real Postgres, only with THUNDERJAR_POSTGRES_URL set to one it may create and drop
// schemas in, e.g. `THUNDERJAR_POSTGRES_URL=postgres://postgres@localhost/postgres bun test runDataStore`.
// Each test gets its own schema, so they don't see each other's records.
const POSTGRES_URL = Bun.env.THUNDERJAR_POSTGRES_URL;

describe.skipIf(!POSTGRES_URL)("postgresStore", () => {
  const schemas: string[] = [];
  /** A URL for a fresh, empty schema of the test database, dropped after the test. */
  const freshDatabase = async () => {
    const schema = `tj_test_${crypto.randomUUID().replaceAll("-", "")}`;
    schemas.push(schema);
    const admin = new SQL(POSTGRES_URL!);
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await admin.close();
    const url = new URL(POSTGRES_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    return url.toString();
  };

  afterEach(async () => {
    const admin = new SQL(POSTGRES_URL!);
    for (const schema of schemas.splice(0)) await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.close();
  });

  test("setupPostgres creates the schema, if it's missing, and the store's tables in it; running it again is harmless", async () => {
    const schema = `tj_test_${crypto.randomUUID().replaceAll("-", "")}`;
    schemas.push(schema);

    await setupPostgres(POSTGRES_URL!, schema);
    await setupPostgres(POSTGRES_URL!, schema);

    const admin = new SQL(POSTGRES_URL!);
    const [tables] = await admin`SELECT to_regclass(${`${schema}.thunderjar_executions`}) IS NOT NULL AS executions,
      to_regclass(${`${schema}.thunderjar_container_runs`}) IS NOT NULL AS container_runs`;
    await admin.close();
    expect(tables).toEqual({ executions: true, container_runs: true });
  });

  test("an empty database is an empty store", async () => {
    const store = postgresStore(await freshDatabase(), "test db");

    expect(await store.listExecutions()).toEqual([]);
    expect(await store.containerRunsOf("01kxxxxxxxxxxxxxxxxxxxxxxx")).toEqual([]);
  });

  test("records and replaces executions and container runs; another store of the database reads them, in order", async () => {
    const url = await freshDatabase();
    const store = postgresStore(url, "test db");
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    const other = "01kfa1bgz1aaaaaaaaaaaaaaaa";

    await store.recordExecution(execution(id, "running"));
    await store.recordExecution(execution(id, "complete"));
    await store.recordExecution(execution(other));
    for (const [p, i] of [[10, 1], [2, 1], [1, 10], [1, 2]] as const) await store.recordContainerRun(containerRun(id, p, i));
    await store.recordContainerRun({ ...containerRun(id, 2, 1), postrunImage: "again" });
    await store.recordContainerRun(containerRun(other, 1, 1));

    const reopened = postgresStore(url, "test db");
    expect(await reopened.listExecutions()).toEqual([execution(other), execution(id, "complete")]);
    const runs = await reopened.containerRunsOf(id);
    expect(runs.map((record) => [record.permutation, record.iteration])).toEqual([[1, 2], [1, 10], [2, 1], [10, 1]]);
    expect(runs[2]).toEqual({ ...containerRun(id, 2, 1), postrunImage: "again" });
  });

  test("marks an execution's postrun images purged, all or only some; marking again merges", async () => {
    const url = await freshDatabase();
    const store = postgresStore(url, "test db");
    const id = "01kfa1bgz0aaaaaaaaaaaaaaaa";
    const other = "01kfa1bgz1aaaaaaaaaaaaaaaa";
    for (const [p, i] of [[1, 1], [1, 2], [2, 1]] as const) await store.recordContainerRun(containerRun(id, p, i));
    await store.recordContainerRun(containerRun(other, 1, 1));

    expect(await store.markPostrunsPurged(id, PURGE, [{ permutation: 1, iteration: 2 }])).toEqual([{ ...containerRun(id, 1, 2), postrunPurge: PURGE }]);
    expect((await store.containerRunsOf(id)).map((run) => run.postrunPurge)).toEqual([undefined, PURGE, undefined]);

    expect(await store.markPostrunsPurged(id, { purgedAt: "2026-11-20T00:00:00.000Z", from: "daemon" })).toHaveLength(3);
    const reopened = postgresStore(url, "test db");
    expect((await reopened.containerRunsOf(id)).map((run) => run.postrunPurge)).toEqual([
      { purgedAt: "2026-11-20T00:00:00.000Z", from: "daemon" },
      { ...PURGE, from: "both" },
      { purgedAt: "2026-11-20T00:00:00.000Z", from: "daemon" },
    ]);
    expect(await reopened.containerRunsOf(other)).toEqual([containerRun(other, 1, 1)]);
  });
});

test("check passes for a SQLite store with no file yet, without creating it, and fails for a file that isn't a store", async () => {
  const file = storeFileIn(dataDir());

  await sqliteStore(file).check();
  expect(await Bun.file(file).exists()).toBe(false);

  await Bun.write(file, "not a database, just some text that is long enough to be a header and more");
  expect(await sqliteStore(file).check().catch(errorOf)).toEqual({ path: file, message: expect.any(String) });
});

test("check fails for a Postgres that can't be reached, after trying again once per retry delay", async () => {
  const store = postgresStore("postgres://user:secret@127.0.0.1:1/none", "Postgres at $THUNDERJAR_DB_URL", { retryDelaysMs: [30, 30] });
  const startedAt = Date.now();

  expect(await store.check().catch(errorOf)).toEqual({ path: "Postgres at $THUNDERJAR_DB_URL", message: expect.any(String) });
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(60);
});

test("a Postgres that can't be reached is a RunDataStoreError named by its label, not its URL", async () => {
  const store = postgresStore("postgres://user:secret@127.0.0.1:1/none", "Postgres at $THUNDERJAR_DB_URL");

  expect(await store.listExecutions().catch(errorOf)).toEqual({ path: "Postgres at $THUNDERJAR_DB_URL", message: expect.any(String) });
});
