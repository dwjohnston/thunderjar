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

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" };

function attribute(attributes: string, name: string): string {
  const value = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? "";
  return value.replace(/&(lt|gt|quot|apos|amp);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** One test in a `bun test --reporter=junit` report. */
export type TestCase = {
  /** `file: describe > test`. */
  id: string;
  file: string;
  line: number;
  failing: boolean;
};

/** The tests in a JUnit report. */
export function testCases(junit: string): TestCase[] {
  const cases: TestCase[] = [];
  for (const match of junit.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const [, attributes = "", body = ""] = match;
    // Bun writes nested describes innermost first: "inner > outer".
    const describes = attribute(attributes, "classname").split(" > ").reverse().filter(Boolean);
    const file = attribute(attributes, "file").replace(/^\.\//, "");
    cases.push({
      id: `${file}: ${[...describes, attribute(attributes, "name")].join(" > ")}`,
      file,
      line: Number(attribute(attributes, "line")),
      failing: body.includes("<failure"),
    });
  }
  return cases;
}

/** The failure count in `bun test`'s summary, which also counts files that didn't load. */
export function summaryFailCount(output: string): number {
  return Number(/^\s*(\d+) fail$/m.exec(output)?.[1] ?? 0);
}

/** The lines a `git diff -U0` adds or changes, per file, in the new version, as [first, last]. */
export function changedLines(_diff: string): Map<string, [number, number][]> {
  return new Map();
}
