/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// The planner: every permutation and run of a test case. Pure.
import type { Manifest, TestCaseConfig } from "./types.ts";

/**
 * The execution ID is passed in rather than made here, so `plan` stays pure. Open: the architecture
 * plan has only `concurrency` in `settings`.
 */
export function plan(_config: TestCaseConfig, _settings: { concurrency: number; executionId: string }): Manifest {
  throw new Error("Not implemented: plan");
}
