#!/usr/bin/env bun
/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston (@dwjohnston)
 *
 * Humans: add your notes here
 */

// Keeps one comment on a pull request that lists the files it changes that need a code owner's
// approval, each linked to its diff. Run by .github/workflows/codeowners-comment.yml.

export type ProtectedFile = { path: string; owners: string[] };

/** The changed files that CODEOWNERS gives an owner other than `author`, with their owners. */
export function protectedFiles(codeowners: string, changed: string[], author: string): ProtectedFile[] {
  const rules = parseCodeowners(codeowners);
  return changed.flatMap((path) => {
    // As in GitHub, the last rule that matches wins.
    const rule = rules.findLast((r) => r.globs.some((g) => g.match(path)));
    if (!rule || rule.owners.length === 0) return [];
    if (rule.owners.some((o) => o.toLowerCase() === `@${author.toLowerCase()}`)) return [];
    return [{ path, owners: rule.owners }];
  });
}

/** Marks the comment this script keeps, so it can find it again. */
export const MARKER = "<!-- codeowners-comment -->";

export type PullRequest = { repo: string; number: number };

/** The comment listing `files`, each linked to its diff in `pr`. */
export function commentBody(files: ProtectedFile[], pr: PullRequest): string {
  const lines = files.map(({ path, owners }) => `- [\`${path}\`](${diffUrl(path, pr)}) (${owners.join(", ")})`);
  return [
    MARKER,
    "### Changes to files with code owners",
    "",
    "This PR changes files that need a code owner's approval:",
    "",
    ...lines,
    "",
  ].join("\n");
}

export type Comment = { id: number; body: string };
export type CommentAction = { kind: "create"; body: string } | { kind: "update"; id: number; body: string } | { kind: "none" };

/** What to do to the PR's comments, given the comment this script left before, if any. */
export function commentAction(_existing: Comment | undefined, files: ProtectedFile[], pr: PullRequest): CommentAction {
  return { kind: "create", body: commentBody(files, pr) };
}

/** GitHub anchors a file's diff on the PR's files tab with the SHA-256 of its path. */
function diffUrl(path: string, pr: PullRequest): string {
  const hash = new Bun.CryptoHasher("sha256").update(path).digest("hex");
  return `https://github.com/${pr.repo}/pull/${pr.number}/files#diff-${hash}`;
}

type Rule = { globs: Bun.Glob[]; owners: string[] };

function parseCodeowners(text: string): Rule[] {
  return text.split("\n").flatMap((line) => {
    const [pattern, ...owners] = line.replace(/#.*/, "").trim().split(/\s+/);
    return pattern ? [{ globs: globsOf(pattern), owners }] : [];
  });
}

/** Globs matching what a CODEOWNERS pattern matches, which follows .gitignore's rules. */
function globsOf(pattern: string): Bun.Glob[] {
  // A slash at the start or in the middle anchors the pattern to the root. Otherwise it matches at any depth.
  const anchored = pattern.replace(/\/$/, "").includes("/");
  let glob = pattern.replace(/^\//, "");
  if (glob.endsWith("/")) glob += "**";
  if (!anchored) glob = `**/${glob}`;
  // A pattern that names a folder matches everything in it.
  return [new Bun.Glob(glob), new Bun.Glob(`${glob}/**`)];
}
