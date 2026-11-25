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
export function loginProblem(error: unknown): string | undefined {
  const message = String(error);
  if (message.includes("password authentication failed")) {
    return "metrics_dashboard's password was rejected. Check CI_METRICS_DB_PASSWORD.";
  }
  return undefined;
}

/** The environment for `docker compose`: Grafana runs on the machine's own platform. */
export function composeEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  // Thunderjar's .env sets it to linux/amd64 for experiment images, and Bun loads .env.
  const { DOCKER_DEFAULT_PLATFORM: _platform, ...rest } = env;
  return rest;
}
