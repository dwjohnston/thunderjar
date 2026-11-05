import { Option } from "commander";
import { FOLDER, findThunderjarRoot } from "../config/loader.ts";
import { loadProjectConfig } from "../config/projectConfig.ts";
import { storeFileIn } from "../store/runDataStore.ts";

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

/**
 * The run data store's file: `runs.sqlite` in `dataDir`, resolved against `cwd`, or else the
 * config's `runDataStore` path, resolved against the project folder holding `root`, the
 * `.thunderjar/` folder. `root` is found from `cwd` if not given, and only if it's needed.
 */
export async function storeFileOf(cwd: string, dataDir?: string, root?: string): Promise<string> {
  if (dataDir !== undefined) return storeFileIn(resolvePath(cwd, dataDir));
  const thunderjarRoot = root ?? (await findThunderjarRoot(cwd));
  const { runDataStore } = await loadProjectConfig(thunderjarRoot);
  return resolvePath(resolvePath(thunderjarRoot, ".."), runDataStore.path);
}

/** `path`, an absolute path, relative to `cwd` if it's inside it. */
export function displayPath(cwd: string, path: string): string {
  const base = resolvePath(cwd, ".");
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
}
