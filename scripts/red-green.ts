#!/usr/bin/env bun
/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLj17bvjTxKwnG6HoJE
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
export type CommitKind = "red" | "multi-red" | "green" | "refactor" | "other";

const MARKERS: Record<string, CommitKind> = { "🔴🔴": "multi-red", "🔴": "red", "🟢": "green", "♻️": "refactor", "♻": "refactor" };

/**
 * What a commit's subject says it is. The marker starts the subject, or follows a `prefix: `,
 * e.g. `🤖 Claude: 🔴 ...`. A marker later in the subject is only mentioned, not meant.
 */
export function commitKind(subject: string): CommitKind {
  const marker = /^(?:[^:]*:\s*)?(🔴🔴|🔴|🟢|♻️|♻)/u.exec(subject)?.[1];
  return marker === undefined ? "other" : (MARKERS[marker] ?? "other");
}

/** Whether a file holds tests or their expectations. The gauntlet's challenges aren't Thunderjar's tests. */
export function isTestFile(path: string): boolean {
  if (path.startsWith("src/gauntlet/")) return false;
  return /\.test\.[cm]?[jt]sx?$/.test(path) || path.endsWith(".result.json");
}
