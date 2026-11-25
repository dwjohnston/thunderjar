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
import { loginProblem } from "./login";

test("a rejected password says to check CI_METRICS_DB_PASSWORD", () => {
  const error = new Error('password authentication failed for user "metrics_dashboard"');
  expect(loginProblem(error)).toContain("CI_METRICS_DB_PASSWORD");
});
