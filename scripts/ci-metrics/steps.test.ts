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

import { expect, test } from "bun:test";
import { stepsOfJob } from "./steps";

const step = (name: string, status: string, conclusion: string | null, started: string, completed: string | null) => ({
  name, status, conclusion, number: 1, started_at: started, completed_at: completed,
});

test("stepsOfJob gives the named job's completed steps and how long each took", () => {
  const response = {
    total_count: 2,
    jobs: [
      { name: "docker", steps: [step("Build", "completed", "success", "2026-11-01T00:00:00Z", "2026-11-01T00:09:00Z")] },
      {
        name: "check",
        steps: [
          step("Run bun run lint", "completed", "success", "2026-11-01T00:00:10Z", "2026-11-01T00:00:22Z"),
          step("Run bun run typecheck", "completed", "failure", "2026-11-01T00:00:22Z", "2026-11-01T00:00:52.5Z"),
          step("Upload test timings", "in_progress", null, "2026-11-01T00:01:00Z", null),
        ],
      },
    ],
  };

  expect(stepsOfJob(response, "check")).toEqual([
    { name: "Run bun run lint", conclusion: "success", seconds: 12 },
    { name: "Run bun run typecheck", conclusion: "failure", seconds: 30.5 },
  ]);
});
