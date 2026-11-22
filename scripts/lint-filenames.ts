#!/usr/bin/env bun
// Fails when a file is named `*.human.*`. The convention is `*.humans.*`, e.g. plan.humans.test.ts.
// oxlint has no rule for file names, so this runs beside it in `bun run lint`.
//
//   bun scripts/lint-filenames.ts
//
// Checks tracked and untracked files that git doesn't ignore, so node_modules, .git and build output are skipped.
import { $ } from "bun";

const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const SINGULAR = /\.human\./;

/** The files named `*.human.*`, with the `*.humans.*` name each should have. */
export function misnamed(paths: string[]): { path: string; suggestion: string }[] {
  return paths.flatMap((path) => {
    const slash = path.lastIndexOf("/") + 1;
    const name = path.slice(slash);
    if (!SINGULAR.test(name)) return [];
    return [{ path, suggestion: path.slice(0, slash) + name.replace(SINGULAR, ".humans.") }];
  });
}

if (import.meta.main) {
  const out = await $`git ls-files --cached --others --exclude-standard`.cwd(REPO_ROOT).text();
  const bad = misnamed(out.split("\n").filter(Boolean));
  if (bad.length > 0) {
    console.error("Files named *.human.* found. The convention is *.humans.* (plural):");
    for (const { path, suggestion } of bad) console.error(`  ${path}  ->  rename to ${suggestion}`);
    process.exit(1);
  }
}
