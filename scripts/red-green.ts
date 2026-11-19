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

/** What a commit's subject says it is. */
export function commitKind(subject: string): CommitKind {
  const marker = /(🔴🔴|🔴|🟢|♻️|♻)/u.exec(subject)?.[1];
  return marker === undefined ? "other" : (MARKERS[marker] ?? "other");
}
