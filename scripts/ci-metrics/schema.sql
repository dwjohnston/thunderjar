-- 🤖 This file was created with AI (Claude Code, session_01LCLeLhdFSg6pjhA6B8LSGh).
-- CI timing metrics. Safe to run again: store.ts runs it before every upload.

-- One row per CI job run, e.g. the "check" job of a workflow run.
create table if not exists ci_runs (
  id bigserial primary key,
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

create index if not exists ci_runs_started_at on ci_runs (started_at);

-- One row per test per CI job run.
create table if not exists ci_test_metrics (
  id bigserial primary key,
  ci_run_id bigint not null references ci_runs (id) on delete cascade,
  -- The job's start, copied here so time series need no join.
  recorded_at timestamptz not null,
  file text not null,
  name text not null,
  status text not null,
  duration_ms double precision not null
);

create index if not exists ci_test_metrics_test on ci_test_metrics (file, name, recorded_at);
create index if not exists ci_test_metrics_run on ci_test_metrics (ci_run_id);
