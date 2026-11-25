#!/usr/bin/env bun
// Fails when a file uses a snapshot matcher, e.g. toMatchInlineSnapshot, unless it's a `*.humans.*` file.
// Snapshots are for the canonical, human-maintained tests: elsewhere, assert on what matters.
//
//   bun scripts/lint-snapshots.ts
//
// Checks the .ts files, tracked and untracked, that git doesn't ignore, outside src/gauntlet.
import { $ } from "bun";

const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const MATCHER = /\b(toMatchSnapshot|toMatchInlineSnapshot|toThrowErrorMatchingSnapshot|toThrowErrorMatchingInlineSnapshot)\b/g;

/** Each snapshot matcher in `source`, unless `path` is a `*.humans.*` file. */
export function snapshotUses(path: string, source: string): { path: string; line: number; matcher: string }[] {
  if (/\.humans\./.test(path.slice(path.lastIndexOf("/") + 1))) return [];
  return source.split("\n").flatMap((text, i) => [...text.matchAll(MATCHER)].map((m) => ({ path, line: i + 1, matcher: m[1]! })));
}

if (import.meta.main) {
  const out = await $`git ls-files --cached --others --exclude-standard -- '*.ts'`.cwd(REPO_ROOT).text();
  const paths = out.split("\n").filter((p) => p && !p.startsWith("src/gauntlet/") && p !== "scripts/lint-snapshots.ts" && p !== "scripts/lint-snapshots.test.ts");
  const bad = (await Promise.all(paths.map(async (p) => snapshotUses(p, await Bun.file(`${REPO_ROOT}/${p}`).text())))).flat();
  if (bad.length > 0) {
    console.error("Snapshot matchers are only allowed in *.humans.* files:");
    for (const { path, line, matcher } of bad) console.error(`  ${path}:${line}  ${matcher}`);
    process.exit(1);
  }
}
