// Finds a project's `.thunderjar/` folder and loads the declarations in it.
import type { TestCaseDeclaration } from "../api/declarations.ts";

export const FOLDER = ".thunderjar";

/** A problem with the project's `.thunderjar/` folder: the CLI prints its message and exits 1. */
export class ConfigError extends Error {}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Bun.file(path).stat()).isDirectory();
  } catch {
    return false;
  }
}

const parentOf = (dir: string) => dir.slice(0, dir.lastIndexOf("/")) || "/";

/** The nearest `.thunderjar/` folder, in `startDir`, an absolute path, or the folders above it. */
export async function findThunderjarRoot(startDir: string): Promise<string> {
  let dir = startDir.replace(/(.)\/+$/, "$1");
  for (;;) {
    const candidate = dir === "/" ? `/${FOLDER}` : `${dir}/${FOLDER}`;
    if (await isDirectory(candidate)) return candidate;
    if (dir === "/") break;
    dir = parentOf(dir);
  }
  throw new ConfigError(`No ${FOLDER}/ folder in ${startDir} or any folder above it. Run \`thunderjar init\` first.`);
}

/** The default export of `<root>/<path>`. */
export async function loadDefault(root: string, path: string): Promise<unknown> {
  const module = (await import(`${root}/${path}`)) as { default?: unknown };
  return module.default;
}

/** The test case declared in `<root>/test-cases/<name>.ts`. */
export async function loadTestCase(root: string, name: string): Promise<TestCaseDeclaration> {
  const path = `test-cases/${name}.ts`;
  if (!(await Bun.file(`${root}/${path}`).exists())) {
    throw new ConfigError(`No test case named "${name}": expected ${FOLDER}/${path}.`);
  }
  return (await loadDefault(root, path)) as TestCaseDeclaration;
}
