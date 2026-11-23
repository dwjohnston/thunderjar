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
import { ConfigError, findThunderjarRoot } from "../../../config/loader.ts";
import { loadProjectConfig } from "../../../config/projectConfig.ts";
import { setupPostgres } from "../../../store/runDataStore.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { print } from "../../output.ts";

function createDbSetupCommand(): Command {
  return new Command("setup")
    .description("Create the run data store's tables in Postgres, with the URL in its adminUrlEnv, by default THUNDERJAR_DB_URL_ADMIN.")
    .action(
      reportingConfigErrors(async () => {
        const { runDataStore } = await loadProjectConfig(await findThunderjarRoot(process.cwd()));
        if (runDataStore.kind !== "postgres") return;
        const url = Bun.env[runDataStore.adminUrlEnv];
        if (!url) {
          throw new ConfigError(
            `db setup creates the run data store's tables with the URL in ${runDataStore.adminUrlEnv}, which is not set.\nExport it with a URL that may create a schema and tables, e.g. the database owner's.`,
          );
        }
        await setupPostgres(url, runDataStore.schema);
        print(`The run data store's tables are in the ${runDataStore.schema} schema of Postgres at $${runDataStore.adminUrlEnv}.`);
      }),
    );
}

export function createDbCommand(): Command {
  return new Command("db").description("Set up the run data store.").addCommand(createDbSetupCommand());
}
