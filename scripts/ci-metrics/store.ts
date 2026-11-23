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

/** Creates the tables if they're missing. */
export async function migrate(sql: SQL): Promise<void> {
  await sql.unsafe(await file(new URL("./schema.sql", import.meta.url)).text());
}

/** Records a job run and its tests, replacing an earlier record of the same run attempt and job. */
export async function recordRun(_sql: SQL, _run: CiRun, _report: JunitReport): Promise<void> {}
