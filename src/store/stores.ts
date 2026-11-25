/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Opening the run data store a command uses: the SQLite file of a `--data-dir`, or else whatever
// the project config's `runDataStore` names. A service (`Stores`), so `run` is given a fake.
import { ConfigError, findThunderjarRoot } from "../config/loader.ts";
import { loadProjectConfig } from "../config/projectConfig.ts";
import type { Env } from "../services/Env/Env.ts";
import { postgresStore, type RunDataStore, sqliteStore, storeFileIn } from "./runDataStore.ts";

/** An open run data store, and where it is: an absolute file path, or a description of a database. */
export type OpenStore = { store: RunDataStore; where: string };

/** Opens the run data store: `dataDir`'s SQLite file, or else the project config's. */
export interface Stores {
  open(dataDir?: string): Promise<OpenStore>;
}

/** `path` resolved against `cwd`, without `.` or `..` segments or a trailing slash. */
export function resolvePath(cwd: string, path: string): string {
  const segments: string[] = [];
  for (const segment of (path.startsWith("/") ? path : `${cwd}/${path}`).split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

/**
 * The run data store: the SQLite file `runs.sqlite` in `dataDir`, resolved against `env.cwd`, or
 * else the config's `runDataStore`: a SQLite path resolved against the project folder holding
 * `root`, the `.thunderjar/` folder, or a Postgres database whose URL is in the variable it names.
 * `root` is found from `env.cwd` if not given, and only if it's needed. Throws a ConfigError if
 * that variable is unset.
 */
export async function openStoreIn(env: Pick<Env, "cwd" | "variables">, dataDir?: string, root?: string): Promise<OpenStore> {
  if (dataDir !== undefined) {
    const where = storeFileIn(resolvePath(env.cwd, dataDir));
    return { store: sqliteStore(where), where };
  }
  const thunderjarRoot = root ?? (await findThunderjarRoot(env.cwd));
  const { runDataStore } = await loadProjectConfig(thunderjarRoot);
  if (runDataStore.kind === "postgres") {
    const url = env.variables[runDataStore.urlEnv];
    if (!url) {
      throw new ConfigError(
        `The run data store is Postgres, at the URL in ${runDataStore.urlEnv}, which is not set.\nExport it in the shell that runs thunderjar, or pass --data-dir to use a local SQLite file.`,
      );
    }
    // Named by its variable, so the URL and its password are never shown.
    const where = `Postgres at $${runDataStore.urlEnv}`;
    return { store: postgresStore(url, where, { schema: runDataStore.schema, adminUrlEnv: runDataStore.adminUrlEnv }), where };
  }
  const where = resolvePath(resolvePath(thunderjarRoot, ".."), runDataStore.path);
  return { store: sqliteStore(where), where };
}

/** The real Stores, of a command run in `env.cwd` with `env.variables`. */
export function createStores(env: Env): Stores {
  return { open: (dataDir) => openStoreIn(env, dataDir) };
}
