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

// `bun run ci-metrics:grafana`: logs in as metrics_dashboard once, and starts Grafana only if that
// works. Each failed login counts towards Supabase's circuit breaker, so failing here, once, beats
// Grafana retrying on every panel.

import { $, SQL } from "bun";
import { composeEnv, loginProblem } from "./login";

const password = Bun.env.CI_METRICS_DB_PASSWORD;
if (!password) {
  process.stderr.write("Set CI_METRICS_DB_PASSWORD to metrics_dashboard's password.\n");
  process.exit(1);
}

const host = Bun.env.CI_METRICS_DB_HOST ?? "aws-0-ap-southeast-2.pooler.supabase.com:5432";
const user = Bun.env.CI_METRICS_DB_USER ?? "metrics_dashboard.oojmoxinrsflssiecitj";
const sslmode = Bun.env.CI_METRICS_DB_SSLMODE ?? "require";
const db = new SQL(
  `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/postgres?sslmode=${sslmode}`,
);

try {
  await db`select 1`;
} catch (error) {
  process.stderr.write(`${loginProblem(error) ?? `Can't log in to the metrics database: ${String(error)}`}\n`);
  process.exit(1);
} finally {
  await db.close();
}

const compose = `${import.meta.dir}/grafana/docker-compose.yml`;
const result = await $`docker compose -f ${compose} up`.env(composeEnv(Bun.env)).nothrow();
process.exit(result.exitCode);
