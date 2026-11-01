import { Option } from "commander";
import { FOLDER } from "../config/loader.ts";

/** `--data-dir <dir>`: the folder holding the run data store, instead of `.thunderjar/.data/`. */
export function dataDirOption(): Option {
  return new Option("--data-dir <dir>", `the folder holding the run data store, instead of ${FOLDER}/.data/`);
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

/** The run data store's folder: `dataDir`, resolved against `cwd`, or `.data/` in `root`, the `.thunderjar/` folder. */
export const dataDirOf = (cwd: string, root: string, dataDir?: string) =>
  dataDir === undefined ? `${root}/.data` : resolvePath(cwd, dataDir);

/** `path`, an absolute path, relative to `cwd` if it's inside it. */
export function displayPath(cwd: string, path: string): string {
  const base = resolvePath(cwd, ".");
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
}
