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

// Writes a CI job's timings to Postgres.

import { file, type SQL } from "bun";
import type { JunitReport } from "./junit";

export interface CiRun {
  runId: number;
  runAttempt: number;
  job: string;
  workflow: string;
  event: string;
  branch: string;
  sha: string;
  prNumber: number | null;
  /** e.g. "success" or "failure". */
  outcome: string;
  startedAt: Date;
  finishedAt: Date;
}

/**
 * Creates the tables if they're missing. A ci_test_metrics without a ci_run_id column, e.g. one
 * made by hand before this schema, is dropped first when it's empty.
 */
export async function migrate(sql: SQL): Promise<void> {
  const columns = await sql`select column_name from information_schema.columns
    where table_name = 'ci_test_metrics' and table_schema = current_schema()`;
  const names: string[] = columns.map((c: { column_name: string }) => c.column_name);
  if (names.length > 0 && !names.includes("ci_run_id")) {
    const [{ count }] = await sql`select count(*)::int as count from ci_test_metrics`;
    if (count === 0) await sql`drop table ci_test_metrics`;
  }
  await sql.unsafe(await file(new URL("./schema.sql", import.meta.url)).text());
}

/** Records a job run and its tests, replacing an earlier record of the same run attempt and job. */
export async function recordRun(sql: SQL, run: CiRun, report: JunitReport): Promise<void> {
  const row = {
    run_id: run.runId,
    run_attempt: run.runAttempt,
    job: run.job,
    workflow: run.workflow,
    event: run.event,
    branch: run.branch,
    sha: run.sha,
    pr_number: run.prNumber,
    outcome: run.outcome,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    job_seconds: (run.finishedAt.getTime() - run.startedAt.getTime()) / 1000,
    test_seconds: report.totalSeconds,
    tests: report.tests.length,
    failures: report.tests.filter((t) => t.status === "failed").length,
    skipped: report.tests.filter((t) => t.status === "skipped").length,
  };
  await sql.begin(async (tx) => {
    // Deleting cascades to the earlier record's tests.
    await tx`delete from ci_runs where run_id = ${row.run_id} and run_attempt = ${row.run_attempt} and job = ${row.job}`;
    const [{ id }] = await tx`insert into ci_runs ${tx(row)} returning id`;
    const tests = report.tests.map((t) => ({
      ci_run_id: id,
      recorded_at: run.startedAt,
      file: t.file,
      name: t.name,
      status: t.status,
      duration_ms: t.durationMs,
    }));
    // Postgres takes at most 65535 parameters a statement.
    for (let i = 0; i < tests.length; i += 1000) {
      await tx`insert into ci_test_metrics ${tx(tests.slice(i, i + 1000))}`;
    }
  });
}
