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

// Uploads a CI job's test timings to the metrics database. Run as a job's last step:
//
//   bun scripts/ci-metrics/upload.ts <junit.xml> --outcome <job.status>
//
// Reads the database URL from CI_METRICS_DB_URL, and the job's start (epoch seconds) from
// CI_JOB_STARTED_AT. Without CI_METRICS_DB_URL, e.g. on a fork's pull request, it does nothing.

import { file, SQL } from "bun";
import { parseJunit } from "./junit";
import { migrate, recordRun } from "./store";

const env = Bun.env;
const [junitPath] = Bun.argv.slice(2);
const outcomeAt = Bun.argv.indexOf("--outcome");
const outcome = outcomeAt === -1 ? "unknown" : Bun.argv[outcomeAt + 1]!;

if (!env.CI_METRICS_DB_URL) {
  process.stdout.write("CI_METRICS_DB_URL is not set: skipping the upload.\n");
  process.exit(0);
}
if (!junitPath || !(await file(junitPath).exists())) {
  process.stderr.write(`No JUnit report at ${junitPath}: the tests didn't run.\n`);
  process.exit(1);
}

const event = env.GITHUB_EVENT_PATH ? await file(env.GITHUB_EVENT_PATH).json() : {};
const startedAt = new Date(Number(env.CI_JOB_STARTED_AT) * 1000);
const report = parseJunit(await file(junitPath).text());

const sql = new SQL(env.CI_METRICS_DB_URL);
try {
  await migrate(sql);
  await recordRun(sql, {
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
    job: env.GITHUB_JOB ?? "unknown",
    workflow: env.GITHUB_WORKFLOW ?? "unknown",
    event: env.GITHUB_EVENT_NAME ?? "unknown",
    branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "unknown",
    // On a pull request GITHUB_SHA is the merge commit; the head is the commit that was pushed.
    sha: event.pull_request?.head?.sha ?? env.GITHUB_SHA ?? "unknown",
    prNumber: event.pull_request?.number ?? null,
    outcome,
    startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
    finishedAt: new Date(),
  }, report);
  process.stdout.write(`Recorded ${report.tests.length} tests, ${report.totalSeconds.toFixed(1)}s of test time.\n`);
} finally {
  await sql.close();
}
