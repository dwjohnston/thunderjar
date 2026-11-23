/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: (see session)
 * Session Id: session_01LCLeLhdFSg6pjhA6B8LSGh
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createTables, recordRun, type CiRun } from "./store";

const run: CiRun = {
  runId: 123,
  runAttempt: 1,
  job: "check",
  workflow: "CI",
  event: "pull_request",
  branch: "some-branch",
  sha: "abc123",
  prNumber: 42,
  outcome: "success",
  startedAt: new Date("2026-11-01T00:00:00Z"),
  finishedAt: new Date("2026-11-01T00:02:30Z"),
};

/** A fresh schema of the Postgres at THUNDERJAR_POSTGRES_URL, dropped when disposed. */
async function freshSchema() {
  const schema = `ci_metrics_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new SQL(Bun.env.THUNDERJAR_POSTGRES_URL!);
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const sql = new SQL(Bun.env.THUNDERJAR_POSTGRES_URL!);
  return {
    sql,
    schema,
    async [Symbol.asyncDispose]() {
      await sql.close();
      await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await admin.close();
    },
  };
}

// Only with THUNDERJAR_POSTGRES_URL set to a Postgres it may create a schema in.
describe.skipIf(!Bun.env.THUNDERJAR_POSTGRES_URL)("recordRun", () => {
  test("records the run, with its job time, and each of its tests", async () => {
    await using db = await freshSchema();
    await createTables(db.sql, db.schema);

    await recordRun(db.sql, run, {
      totalSeconds: 70.5,
      tests: [
        { file: "a.test.ts", name: "fast", durationMs: 2, status: "passed" },
        { file: "a.test.ts", name: "broken", durationMs: 30, status: "failed" },
        { file: "b.test.ts", name: "later", durationMs: 0, status: "skipped" },
      ],
    }, db.schema);

    const runs = await db.sql`select run_id, job, pr_number, job_seconds, test_seconds, tests, failures, skipped from ${db.sql(db.schema)}.ci_runs`;
    expect([...runs]).toEqual([
      { run_id: "123", job: "check", pr_number: 42, job_seconds: 150, test_seconds: 70.5, tests: 3, failures: 1, skipped: 1 },
    ]);
    const tests = await db.sql`select recorded_at, file, name, status, duration_ms from ${db.sql(db.schema)}.ci_test_metrics order by id`;
    expect([...tests]).toEqual([
      { recorded_at: run.startedAt, file: "a.test.ts", name: "fast", status: "passed", duration_ms: 2 },
      { recorded_at: run.startedAt, file: "a.test.ts", name: "broken", status: "failed", duration_ms: 30 },
      { recorded_at: run.startedAt, file: "b.test.ts", name: "later", status: "skipped", duration_ms: 0 },
    ]);
  });

  test("records a run as a role that may only insert, like CI's ci_metrics_writer", async () => {
    await using db = await freshSchema();
    await createTables(db.sql, db.schema);
    const writer = `${db.schema}_writer`;
    await db.sql.unsafe(`create role ${writer} nologin`);
    await db.sql.unsafe(`grant usage on schema ${db.schema} to ${writer}`);
    await db.sql.unsafe(`grant insert on all tables in schema ${db.schema} to ${writer}`);
    await db.sql.unsafe(`grant usage on all sequences in schema ${db.schema} to ${writer}`);
    const asWriter = new SQL(Bun.env.THUNDERJAR_POSTGRES_URL!, { max: 1 });
    await asWriter.unsafe(`set role ${writer}`);

    try {
      await expect(
        recordRun(asWriter, run, { totalSeconds: 1, tests: [{ file: "a.test.ts", name: "fast", durationMs: 2, status: "passed" }] }, db.schema),
      ).resolves.toBeUndefined();
    } finally {
      await asWriter.close();
      await db.sql.unsafe(`drop owned by ${writer}`);
      await db.sql.unsafe(`drop role ${writer}`);
    }

    const tests = await db.sql`select name from ${db.sql(db.schema)}.ci_test_metrics`;
    expect([...tests]).toEqual([{ name: "fast" }]);
  });

  test("createTables refuses a ci_test_metrics of another shape, e.g. one made by hand, and leaves it alone", async () => {
    await using db = await freshSchema();
    await db.sql`create table ${db.sql(db.schema)}.ci_test_metrics (id serial primary key, test_name text not null, duration numeric not null)`;

    await expect(createTables(db.sql, db.schema)).rejects.toThrow(`${db.schema}.ci_test_metrics has another shape: drop or rename it, then run this again`);

    const columns = await db.sql`select column_name from information_schema.columns
      where table_name = 'ci_test_metrics' and table_schema = ${db.schema} order by ordinal_position`;
    expect(columns.map((c: { column_name: string }) => c.column_name)).toEqual(["id", "test_name", "duration"]);
  });
});
