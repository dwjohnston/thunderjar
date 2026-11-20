import type { Commit } from "../../api/declarations.ts";
import type { Instrument } from "../instrument.ts";

const START = "refs/thunderjar/start";

/**
 * The `git log` command `parseGitLog` reads the output of. Oldest first, merges included and
 * diffed against their first parent, renames as a delete and an add. `-z` keeps odd paths intact.
 */
export const GIT_LOG = `git log --reverse --no-renames --diff-merges=first-parent --name-status -z --format=%x01%H%x02%B%x03 ${START}..HEAD`;

/** Parses the output of `GIT_LOG` into commits, in the order printed. */
export function parseGitLog(output: string): Commit[] {
  return output
    .split("\x01")
    .filter((chunk) => chunk !== "")
    .map((chunk) => {
      const [sha, rest = ""] = chunk.split("\x02", 2) as [string, string?];
      const end = rest.indexOf("\x03");
      const message = rest.slice(0, end).trimEnd();
      // After the message: NUL-separated status, path pairs.
      const tokens = rest.slice(end + 1).split("\0").map((token) => token.replace(/^\n/, "")).filter((token) => token !== "");
      const files: Commit["files"] = { added: [], modified: [], deleted: [] };
      for (let i = 0; i + 1 < tokens.length; i += 2) {
        const status = tokens[i]![0];
        const path = tokens[i + 1]!;
        if (status === "A") files.added.push(path);
        else if (status === "D") files.deleted.push(path);
        else files.modified.push(path);
      }
      return { sha: sha.trim(), message, files };
    });
}

/**
 * The commits made since `refs/thunderjar/start`, oldest first. `skipped` when the workspace
 * isn't a git repository or has no such ref: a run with no start isn't "no commits".
 */
export const commits: Instrument<Record<string, never>, Commit[]> = {
  version: 1,
  async evaluate(_config, ctx) {
    const probe = await ctx.exec(`git rev-parse --verify -q ${START}`);
    if (probe.exitCode !== 0) return { outcome: "skipped", reason: `the workspace has no ${START}` };
    const log = await ctx.exec(GIT_LOG);
    if (log.exitCode !== 0) return { outcome: "skipped", reason: `git log failed: ${log.stderr.trim()}` };
    return { outcome: "measured", data: parseGitLog(log.stdout) };
  },
  checkConfig: () => [],
};
