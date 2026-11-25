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
export function stepsOfJob(jobsResponse: unknown, job: string): CiStep[] {
  const { jobs } = jobsResponse as { jobs: GithubJob[] };
  const steps = jobs.find((j) => j.name === job)?.steps ?? [];
  return steps
    .filter((s) => s.status === "completed" && s.started_at && s.completed_at)
    .map((s) => ({
      name: s.name,
      conclusion: s.conclusion ?? "unknown",
      seconds: (Date.parse(s.completed_at!) - Date.parse(s.started_at!)) / 1000,
    }));
}

interface GithubJob {
  name: string;
  steps?: { name: string; status: string; conclusion: string | null; started_at: string | null; completed_at: string | null }[];
}
