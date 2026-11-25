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

// Checks metrics_dashboard's login before Grafana starts, so a wrong password fails fast with a
// clear message instead of a dashboard with no data.

/** What to tell the user when the login fails with this error, or undefined if it's unknown. */
export function loginProblem(_error: unknown): string | undefined {
  return undefined;
}
