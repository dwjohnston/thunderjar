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

// Creates the CI metrics tables in the `metrics` schema. Run by hand, once, and again after a
// schema change; it's safe to repeat:
//
//   CI_METRICS_DB_URL_ADMIN=... bun scripts/ci-metrics/create-tables.ts
//
// CI_METRICS_DB_URL_ADMIN must log in as a member of metrics_owner, e.g. david_admin. The tables are
// created as metrics_owner, so its default privileges give metrics_read SELECT and metrics_write
// INSERT on them. CI's own URL can only insert, so the upload never creates tables.

import { SQL } from "bun";
import { createTables } from "./store";

const url = Bun.env.CI_METRICS_DB_URL_ADMIN;
if (!url) {
  process.stderr.write("Set CI_METRICS_DB_URL_ADMIN to the URL of a member of metrics_owner, e.g. david_admin.\n");
  process.exit(1);
}

// One connection, so `set role` applies to every statement.
const sql = new SQL(url, { max: 1 });
try {
  await sql`set role metrics_owner`;
  await createTables(sql);
  process.stdout.write("✅ The metrics tables are ready.\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await sql.close();
}
