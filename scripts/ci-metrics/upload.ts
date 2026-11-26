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
// CI_JOB_STARTED_AT. With GITHUB_TOKEN, it also records how long each of the job's earlier steps
// took, e.g. lint and typecheck, from GitHub's API. Without CI_METRICS_DB_URL, e.g. on a fork's pull request, it does nothing.
// It only inserts: the tables are made beforehand, by hand, with create-tables.ts.
// On a pull request, a failure is also a comment on it, kept up to date and deleted once an upload works.

import { file, SQL } from "bun";
import { parseJunit } from "./junit";
import { syncWarningComment } from "./comment";
import { recordRun } from "./store";
import { type CiStep, stepsOfJob } from "./steps";

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

/** The job's finished steps, from GitHub. None, with a warning, if they can't be read: they're a bonus. */
async function jobSteps(): Promise<CiStep[]> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID || !env.GITHUB_JOB) return [];
  const url = `${env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT ?? 1}/jobs?per_page=100`;
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return stepsOfJob(await response.json(), env.GITHUB_JOB);
  } catch (error) {
    process.stderr.write(`Couldn't read the job's steps, so recording none: ${error instanceof Error ? error.message : String(error)}\n`);
    return [];
  }
}
const steps = await jobSteps();

/** Posts, updates or deletes the pull request's warning. A failure here is only logged: it's a bonus too. */
async function warnOnPullRequest(problem?: string): Promise<void> {
  const prNumber = event.pull_request?.number;
  if (!prNumber || !env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) return;
  try {
    await syncWarningComment({
      apiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
      repository: env.GITHUB_REPOSITORY,
      prNumber,
      job: env.GITHUB_JOB ?? "unknown",
      token: env.GITHUB_TOKEN,
      problem,
    });
  } catch (error) {
    process.stderr.write(`Couldn't update the pull request's warning comment: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

const sql = new SQL(env.CI_METRICS_DB_URL);
try {
  const { stepsError } = await recordRun(sql, {
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
  }, report, undefined, steps);
  const recordedSteps = stepsError ? 0 : steps.length;
  process.stdout.write(`Recorded ${report.tests.length} tests, ${report.totalSeconds.toFixed(1)}s of test time, ${recordedSteps} steps.\n`);
  // A GitHub annotation: shown on the run's summary, not only in this step's log.
  if (stepsError) process.stdout.write(`::warning title=CI metrics::Recorded the run and its tests, but not its steps: ${stepsError}\n`);
  await warnOnPullRequest(stepsError && `Recorded the run and its tests, but not its steps: ${stepsError}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`::error title=CI metrics::Recorded nothing: ${message}\n`);
  await warnOnPullRequest(`Recorded nothing: ${message}`);
  throw error;
} finally {
  await sql.close();
}
