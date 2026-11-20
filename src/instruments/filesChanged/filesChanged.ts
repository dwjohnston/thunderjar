import type { FileChanges } from "../../api/declarations.ts";
import type { Instrument } from "../instrument.ts";

const START = "refs/thunderjar/start";

/**
 * Tracked files, the working tree against the start: committed, staged and unstaged changes
 * alike. A rename is a deletion and an addition. Paths are relative to the workspace.
 */
export const GIT_DIFF = `git diff --no-renames --name-status -z --relative ${START}`;

/** Files git doesn't track and doesn't ignore. Paths are relative to the workspace. */
export const GIT_UNTRACKED = "git ls-files --others --exclude-standard -z";

/** Parses the output of `GIT_DIFF`: NUL-separated status, path pairs. */
export function parseNameStatus(output: string): FileChanges {
  const tokens = output.split("\0").filter((token) => token !== "");
  const changes: FileChanges = { added: [], modified: [], deleted: [] };
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const status = tokens[i]![0];
    const path = tokens[i + 1]!;
    if (status === "A") changes.added.push(path);
    else if (status === "D") changes.deleted.push(path);
    else changes.modified.push(path);
  }
  return changes;
}

/** Parses the output of `GIT_UNTRACKED`: NUL-separated paths. */
export function parseUntracked(output: string): string[] {
  return output.split("\0").filter((path) => path !== "");
}

/** Keeps the paths matching `glob`, or all of them without one. */
export function filterByGlob(changes: FileChanges, glob: string | undefined): FileChanges {
  if (glob === undefined) return changes;
  const matcher = new Bun.Glob(glob);
  const keep = (paths: string[]) => paths.filter((path) => matcher.match(path));
  return { added: keep(changes.added), modified: keep(changes.modified), deleted: keep(changes.deleted) };
}

const fail = (reason: string) => ({ outcome: "erroredWhileMeasuring" as const, error: new Error(reason) });

/**
 * Everything changed since `refs/thunderjar/start`, committed or not, as one `FileChanges`.
 * Untracked files count as added, ignored ones are left out. Fails in a workspace that isn't a
 * git repository, or has no start.
 */
export const filesChanged: Instrument<{ glob?: string }, FileChanges> = {
  version: 1,
  async evaluate({ glob }, ctx) {
    const inside = await ctx.exec("git rev-parse --is-inside-work-tree");
    if (inside.exitCode !== 0) return fail(`the workspace is not a git repository: ${inside.stderr.trim()}`);
    const probe = await ctx.exec(`git rev-parse --verify -q ${START}`);
    if (probe.exitCode !== 0) return fail(`the workspace has no ${START}`);
    const diff = await ctx.exec(GIT_DIFF);
    if (diff.exitCode !== 0) return fail(`git diff failed: ${diff.stderr.trim()}`);
    const untracked = await ctx.exec(GIT_UNTRACKED);
    if (untracked.exitCode !== 0) return fail(`git ls-files failed: ${untracked.stderr.trim()}`);
    const changes = parseNameStatus(diff.stdout);
    changes.added.push(...parseUntracked(untracked.stdout));
    for (const paths of Object.values(changes)) paths.sort();
    return { outcome: "measured", data: filterByGlob(changes, glob) };
  },
  checkConfig(config) {
    const glob = (config as { glob?: unknown } | undefined)?.glob;
    return glob === undefined || (typeof glob === "string" && glob !== "") ? [] : [["config.glob", `must be a glob pattern, got ${JSON.stringify(glob)}`]];
  },
};
