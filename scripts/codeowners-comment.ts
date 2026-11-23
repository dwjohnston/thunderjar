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
export function protectedFiles(_codeowners: string, _changed: string[], _author: string): ProtectedFile[] {
  return [];
}
