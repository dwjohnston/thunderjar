/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Reads a CI job's step timings from GitHub's "list jobs for a workflow run attempt" response.

export interface CiStep {
  name: string;
  /** e.g. "success", "failure" or "skipped". */
  conclusion: string;
  seconds: number;
}

/** The completed steps of the job named `job`, in order. Unfinished steps, e.g. the upload itself, are left out. */
export function stepsOfJob(_jobsResponse: unknown, _job: string): CiStep[] {
  return [];
}
