// Turns scripts/layout.ts into oxlint rules, and checks that every file is somewhere the
// layout allows.
//
//   bun scripts/sync-oxlint-layout.ts           rewrite the generated region of .oxlintrc.json
//   bun scripts/sync-oxlint-layout.ts --check   fail on files under src/ or test/ that no entry allows
import { isDirectory } from "../src/platform/fs.ts";
import { basename, dirname, join, relative, resolve } from "../src/platform/path.ts";
import { layout as repoLayout, type Layout } from "./layout.ts";

export const BEGIN = "// sync-oxlint-layout: begin — generated, do not edit";
export const END = "// sync-oxlint-layout: end";

/** The top-level folders whose files must all be covered by a layout entry. */
export const CHECKED_ROOTS = ["src", "test"];

type Override = { files: string[]; rules: Record<string, unknown> };
type Pattern = { regex: string; message?: string };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * An import specifier, written from a file in `from`, that names a file directly inside
 * `to` (or `to` itself, as a directory import).
 */
function importRegex(from: string, to: string): string {
  let rel = relative(from, to);
  if (!rel.startsWith("..")) rel = `./${rel}`;
  return `^${escapeRegex(rel)}(/[^/]+)?$`;
}

/**
 * The `no-restricted-imports` patterns at the top level of `config`, such as the ban on node's
 * APIs. An override replaces a rule's options for the files it matches, so every generated
 * override repeats them.
 */
export function basePatterns(config: string): Pattern[] {
  const { rules } = Bun.JSONC.parse(config) as { rules?: Record<string, unknown> };
  const rule = rules?.["no-restricted-imports"];
  return (Array.isArray(rule) ? (rule[1] as { patterns?: Pattern[] } | undefined)?.patterns : undefined) ?? [];
}

export function generateOverrides(layout: Layout, base: Pattern[] = []): Override[] {
  const folders = Object.keys(layout).sort();
  return folders.map((folder) => {
    const entry = layout[folder]!;
    const allowed = new Set(entry.mayImport ?? []);
    const patterns = folders
      .filter((other) => other !== folder && !allowed.has(other))
      .map((other) => ({
        regex: importRegex(folder, other),
        message: `${folder} may not import from ${other}. See scripts/layout.ts.`,
      }));
    const rules: Record<string, unknown> = {
      "unicorn/filename-case": ["error", { case: entry.filenameCase ?? "kebabCase" }],
    };
    if (base.length + patterns.length > 0) {
      rules["no-restricted-imports"] = ["error", { patterns: [...base, ...patterns] }];
    }
    return { files: [`${folder}/*`], rules };
  });
}

/** Replaces the text between the markers in `config`, leaving everything else as it was. */
export function applyRegion(config: string, overrides: Override[]): string {
  const begin = config.indexOf(BEGIN);
  const end = config.indexOf(END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`.oxlintrc.json must contain the markers "${BEGIN}" and "${END}", in that order.`);
  }
  const lineStart = config.lastIndexOf("\n", begin) + 1;
  const indent = config.slice(lineStart, begin);
  const body = `"overrides": ${JSON.stringify(overrides, null, 2)},`.replaceAll("\n", `\n${indent}`);
  return `${config.slice(0, begin)}${BEGIN}\n${indent}${body}\n${indent}${config.slice(end)}`;
}

/** Rewrites the generated region of `<root>/.oxlintrc.json`. Returns whether it changed. */
export async function sync(root: string, layout: Layout): Promise<boolean> {
  const path = join(root, ".oxlintrc.json");
  const before = await Bun.file(path).text();
  const after = applyRegion(before, generateOverrides(layout, basePatterns(before)));
  if (after === before) return false;
  await Bun.write(path, after);
  return true;
}

/** The files under `dir`, hidden ones included, relative to `dir`. */
async function listFiles(dir: string): Promise<string[]> {
  return Array.fromAsync(new Bun.Glob("**").scan({ cwd: dir, dot: true, onlyFiles: true }));
}

/** Files under the checked roots, relative to `root`, that no layout entry allows. */
export async function findMisplaced(root: string, layout: Layout): Promise<string[]> {
  const misplaced: string[] = [];
  for (const top of CHECKED_ROOTS) {
    const dir = join(root, top);
    if (!(await isDirectory(dir))) continue;
    for (const file of await listFiles(dir)) {
      const rel = `${top}/${file}`;
      const entry = layout[dirname(rel)];
      const name = basename(rel);
      if (!entry?.allowedFiles.some((glob) => new Bun.Glob(glob).match(name))) misplaced.push(rel);
    }
  }
  return misplaced.sort();
}

export function formatMisplaced(files: string[]): string {
  return files
    .map((f) => `${f}: not allowed here by scripts/layout.ts. See 150-repository-layout.md in the spec.`)
    .join("\n");
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  if (Bun.argv.includes("--check")) {
    const misplaced = await findMisplaced(root, repoLayout);
    if (misplaced.length > 0) {
      console.error(formatMisplaced(misplaced));
      process.exit(1);
    }
  } else if (await sync(root, repoLayout)) {
    console.log("updated .oxlintrc.json");
  }
}
