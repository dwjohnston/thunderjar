// Lists what is declared in a folder of `.thunderjar/`.
import { Glob } from "bun";
import { ConfigError, existsIn, FOLDER } from "./loader.ts";

export const PARAMETERS = "test-case-parameters";

const sorted = (names: Iterable<string>) => [...new Set(names)].toSorted();

/** The names in `<root>/<dir>` that match `pattern`, sorted. None if the folder doesn't exist. */
async function scan(root: string, dir: string, pattern: string, onlyFiles: boolean): Promise<string[]> {
  if (!(await existsIn(root, `${dir}/`))) return [];
  try {
    return sorted(new Glob(pattern).scanSync({ cwd: `${root}/${dir}`, onlyFiles }));
  } catch (error) {
    throw new ConfigError(`${FOLDER}/${dir}/ could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The folders directly in `<root>/<dir>`, sorted. None if it doesn't exist. */
export async function foldersIn(root: string, dir: string): Promise<string[]> {
  const folders: string[] = [];
  for (const name of await scan(root, dir, "*", false)) {
    if (await existsIn(root, `${dir}/${name}/`)) folders.push(name);
  }
  return folders;
}

/** The names of the `.ts` files directly in `<root>/<dir>`, without `.ts`, sorted. None if it doesn't exist. */
export async function tsFilesIn(root: string, dir: string): Promise<string[]> {
  return (await scan(root, dir, "*.ts", true)).map((path) => path.slice(0, -".ts".length));
}
