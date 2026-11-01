// Finds a project's `.thunderjar/` folder and loads the declarations in it.
import { declaredBy } from "../api/declarations.ts";

export const FOLDER = ".thunderjar";

/**
 * Problems with the project's `.thunderjar/` folder, one line each: the CLI prints each as
 * `Error: <problem>` and exits 1.
 */
export class ConfigError extends Error {
  readonly problems: string[];

  constructor(...problems: string[]) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

/** A problem in the file `<root>/<file>`, with the field of it that's wrong, if any. */
export type Problem = { file: string; field?: string; message: string };

/** `problems` as one ConfigError, each naming its file relative to the project, e.g. `.thunderjar/test-cases/example.ts`. */
export function problemsError(problems: Problem[]): ConfigError {
  return new ConfigError(
    ...problems.map(({ file, field, message }) => `${FOLDER}/${file}: ${field ? `${field}: ` : ""}${message}`),
  );
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Bun.file(path).stat()).isDirectory();
  } catch {
    return false;
  }
}

/** Whether `<root>/<path>` exists: a folder if `path` ends in `/`, a file otherwise. */
export async function existsIn(root: string, path: string): Promise<boolean> {
  return path.endsWith("/") ? isDirectory(`${root}/${path}`) : Bun.file(`${root}/${path}`).exists();
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

/**
 * The default export of `<root>/<file>`, which must be what `declareFn` returned. Otherwise adds
 * the problem to `problems` and returns undefined.
 */
export async function loadDeclaration(
  root: string,
  file: string,
  declareFn: string,
  problems: Problem[],
): Promise<unknown> {
  if (!(await existsIn(root, file))) {
    problems.push({ file, message: `is missing. Export \`${declareFn}(...)\` from it as the default.` });
    return undefined;
  }
  let module: { default?: unknown };
  try {
    module = (await import(`${root}/${file}`)) as { default?: unknown };
  } catch (error) {
    problems.push({ file, message: `could not be loaded: ${error instanceof Error ? error.message : String(error)}` });
    return undefined;
  }
  if (module.default === undefined) {
    problems.push({ file, message: `has no default export. Export \`${declareFn}(...)\` as the default.` });
    return undefined;
  }
  const by = declaredBy(module.default);
  if (by !== declareFn) {
    problems.push({
      file,
      message: by
        ? `default export is wrapped in ${by}, expected ${declareFn}.`
        : `default export is not wrapped in ${declareFn}(...).`,
    });
    return undefined;
  }
  return module.default;
}
