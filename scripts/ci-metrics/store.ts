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

import type { SQL } from "bun";
import type { JunitReport } from "./junit";
import type { CiStep } from "./steps";

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

/** The schema the tables live in. Tests pass a throwaway one. */
export const SCHEMA = "metrics";

/** The tables, in `schema`. Safe to run again. */
function tablesSql(schema: string): string {
  return `
-- One row per CI job run, e.g. the "check" job of a workflow run.
create table if not exists ${schema}.ci_runs (
  -- Made by the upload, so it needs no RETURNING, which would take SELECT.
  id uuid primary key,
  run_id bigint not null,
  run_attempt int not null,
  job text not null,
  workflow text not null,
  event text not null,
  branch text not null,
  sha text not null,
  pr_number int,
  outcome text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  -- From the job's first step to the upload.
  job_seconds double precision not null,
  -- The test runner's own wall-clock time.
  test_seconds double precision not null,
  tests int not null,
  failures int not null,
  skipped int not null,
  unique (run_id, run_attempt, job)
);
create index if not exists ci_runs_started_at on ${schema}.ci_runs (started_at);

-- One row per test per CI job run.
create table if not exists ${schema}.ci_test_metrics (
  id bigserial primary key,
  ci_run_id uuid not null references ${schema}.ci_runs (id) on delete cascade,
  -- The job's start, copied here so time series need no join.
  recorded_at timestamptz not null,
  file text not null,
  name text not null,
  status text not null,
  duration_ms double precision not null
);
create index if not exists ci_test_metrics_test on ${schema}.ci_test_metrics (file, name, recorded_at);
create index if not exists ci_test_metrics_run on ${schema}.ci_test_metrics (ci_run_id);

-- One row per step per CI job run, e.g. lint or typecheck.
create table if not exists ${schema}.ci_step_metrics (
  id bigserial primary key,
  ci_run_id uuid not null references ${schema}.ci_runs (id) on delete cascade,
  -- The job's start, copied here so time series need no join.
  recorded_at timestamptz not null,
  -- The step's position in the job, from 1.
  position int not null,
  name text not null,
  conclusion text not null,
  seconds double precision not null
);
create index if not exists ci_step_metrics_step on ${schema}.ci_step_metrics (name, recorded_at);
create index if not exists ci_step_metrics_run on ${schema}.ci_step_metrics (ci_run_id);
`;
}

/**
 * Creates the tables in `schema` if they're missing. Throws, changing nothing, if a ci_test_metrics
 * without a ci_run_id column is there, e.g. one made by hand before this schema: a person decides
 * whether to drop it.
 */
export async function createTables(sql: SQL, schema = SCHEMA): Promise<void> {
  const columns = await sql`select column_name from information_schema.columns
    where table_name = 'ci_test_metrics' and table_schema = ${schema}`;
  const names: string[] = columns.map((c: { column_name: string }) => c.column_name);
  if (names.length > 0 && !names.includes("ci_run_id")) {
    throw new Error(`${schema}.ci_test_metrics has another shape: drop or rename it, then run this again`);
  }
  await sql.unsafe(tablesSql(schema));
}

/**
 * Records a job run, its tests and its steps. It only inserts, so CI's role needs INSERT and nothing else. A
 * second record of the same run attempt and job is refused, by ci_runs' unique key: one upload per
 * job, and a re-run is a new attempt.
 */
export async function recordRun(
  sql: SQL,
  run: CiRun,
  report: JunitReport,
  schema = SCHEMA,
  _steps: CiStep[] = [],
): Promise<void> {
  const row = {
    id: crypto.randomUUID(),
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
    await tx`insert into ${tx(schema)}.ci_runs ${tx(row)}`;
    const tests = report.tests.map((t) => ({
      ci_run_id: row.id,
      recorded_at: run.startedAt,
      file: t.file,
      name: t.name,
      status: t.status,
      duration_ms: t.durationMs,
    }));
    // Postgres takes at most 65535 parameters a statement.
    for (let i = 0; i < tests.length; i += 1000) {
      await tx`insert into ${tx(schema)}.ci_test_metrics ${tx(tests.slice(i, i + 1000))}`;
    }
  });
}
