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
//
//   REPO=owner/name PR_NUMBER=12 PR_AUTHOR=someone bun scripts/codeowners-comment.ts
//
// It reads .github/CODEOWNERS from the working tree, and talks to GitHub with `gh`.

import { $, file } from "bun";

function requireEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

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

const NO_LONGER = [
  MARKER,
  "### Changes to files with code owners",
  "",
  "This PR no longer changes files that need a code owner's approval.",
  "",
].join("\n");

export type Comment ={ id: number; body: string };
export type CommentAction = { kind: "create"; body: string } | { kind: "update"; id: number; body: string } | { kind: "none" };

/** What to do to the PR's comments, given the comment this script left before, if any. */
export function commentAction(existing: Comment | undefined, files: ProtectedFile[], pr: PullRequest): CommentAction {
  if (files.length === 0 && !existing) return { kind: "none" };
  const body = files.length === 0 ? NO_LONGER : commentBody(files, pr);
  return existing ? { kind: "update", id: existing.id, body } : { kind: "create", body };
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

// Last, so the consts above (MARKER, NO_LONGER) are initialised before it runs.
if (import.meta.main) {
  const pr = { repo: requireEnv("REPO"), number: Number(requireEnv("PR_NUMBER")) };
  const author = requireEnv("PR_AUTHOR");
  const codeowners = await file(".github/CODEOWNERS").text();

  const changed = (await $`gh api --paginate repos/${pr.repo}/pulls/${pr.number}/files --jq ${".[].filename"}`.text())
    .split("\n")
    .filter(Boolean);
  const comments: Comment[] = (await $`gh api --paginate repos/${pr.repo}/issues/${pr.number}/comments --jq ${".[] | {id, body}"}`.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Comment);
  const existing = comments.find((c) => c.body.startsWith(MARKER));

  const action = commentAction(existing, protectedFiles(codeowners, changed, author), pr);
  if (action.kind === "create") {
    await $`gh api repos/${pr.repo}/issues/${pr.number}/comments -f body=${action.body}`.quiet();
  } else if (action.kind === "update" && action.body !== existing?.body) {
    await $`gh api -X PATCH repos/${pr.repo}/issues/comments/${action.id} -f body=${action.body}`.quiet();
  }
}
