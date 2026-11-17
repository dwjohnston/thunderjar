import { Option } from "commander";
import { ConfigError, FOLDER, findThunderjarRoot } from "../config/loader.ts";
import { loadProjectConfig } from "../config/projectConfig.ts";
import { postgresStore, type RunDataStore, sqliteStore, storeFileIn } from "../store/runDataStore.ts";

/** `--data-dir <dir>`: the folder holding the run data store, `runs.sqlite`, instead of the config's `runDataStore`. */
export function dataDirOption(): Option {
  return new Option("--data-dir <dir>", `the folder holding the run data store, as runs.sqlite, instead of the runDataStore of ${FOLDER}/thunderjar.config.ts`);
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

/** An open run data store, and where it is: an absolute file path, or a description of a database. */
export type OpenStore = { store: RunDataStore; where: string };

/**
 * The run data store: the SQLite file `runs.sqlite` in `dataDir`, resolved against `cwd`, or else
 * the config's `runDataStore`: a SQLite path resolved against the project folder holding `root`,
 * the `.thunderjar/` folder, or a Postgres database whose URL is in the variable it names. `root`
 * is found from `cwd` if not given, and only if it's needed. Throws a ConfigError if that variable is unset.
 */
export async function openStore(
  cwd: string,
  dataDir?: string,
  root?: string,
  env: Record<string, string | undefined> = Bun.env,
): Promise<OpenStore> {
  if (dataDir !== undefined) {
    const where = storeFileIn(resolvePath(cwd, dataDir));
    return { store: sqliteStore(where), where };
  }
  const thunderjarRoot = root ?? (await findThunderjarRoot(cwd));
  const { runDataStore } = await loadProjectConfig(thunderjarRoot);
  if (runDataStore.kind === "postgres") {
    const url = env[runDataStore.urlEnv];
    if (!url) {
      throw new ConfigError(
        `The run data store is Postgres, at the URL in ${runDataStore.urlEnv}, which is not set.\nExport it in the shell that runs thunderjar, or pass --data-dir to use a local SQLite file.`,
      );
    }
    const where = `Postgres at $${runDataStore.urlEnv}`;
    return { store: postgresStore(url, where), where };
  }
  const where = resolvePath(resolvePath(thunderjarRoot, ".."), runDataStore.path);
  return { store: sqliteStore(where), where };
}

/** `path`, an absolute path, relative to `cwd` if it's inside it. */
export function displayPath(cwd: string, path: string): string {
  const base = resolvePath(cwd, ".");
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
}
