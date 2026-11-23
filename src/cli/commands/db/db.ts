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

// `thunderjar db setup`: creates a postgresStore's schema and tables, with the URL in its
// `adminUrlEnv`, so the URL every other command uses needs only to select, insert and update.
// A sqliteStore creates its own tables, so there's nothing to set up.
import { Command } from "commander";

function createDbSetupCommand(): Command {
  return new Command("setup").description("Create the run data store's tables in Postgres.").action(async () => {});
}

export function createDbCommand(): Command {
  return new Command("db").description("Set up the run data store.").addCommand(createDbSetupCommand());
}
