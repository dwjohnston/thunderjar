import { Option } from "commander";
import { FOLDER } from "../config/loader.ts";
import { type OpenStore, openStoreIn, resolvePath } from "../store/stores.ts";

/** `--data-dir <dir>`: the folder holding the run data store, `runs.sqlite`, instead of the config's `runDataStore`. */
export function dataDirOption(): Option {
  return new Option("--data-dir <dir>", `the folder holding the run data store, as runs.sqlite, instead of the runDataStore of ${FOLDER}/thunderjar.config.ts`);
}

export { type OpenStore, resolvePath } from "../store/stores.ts";

/**
 * The run data store: the SQLite file `runs.sqlite` in `dataDir`, resolved against `cwd`, or else
 * the config's `runDataStore`: a SQLite path resolved against the project folder holding `root`,
 * the `.thunderjar/` folder, or a Postgres database whose URL is in the variable it names. `root`
 * is found from `cwd` if not given, and only if it's needed. Throws a ConfigError if that variable is unset.
 */
export function openStore(cwd: string, dataDir?: string, root?: string, env: Record<string, string | undefined> = Bun.env): Promise<OpenStore> {
  return openStoreIn({ cwd, variables: env }, dataDir, root);
}

/** `path`, an absolute path, relative to `cwd` if it's inside it. */
export function displayPath(cwd: string, path: string): string {
  const base = resolvePath(cwd, ".");
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
}
