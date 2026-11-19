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
export function changedLines(diff: string): Map<string, [number, number][]> {
  const changed = new Map<string, [number, number][]>();
  let file = "";
  for (const line of diff.split("\n")) {
    const path = /^\+\+\+ (?:b\/)?(.*)$/.exec(line)?.[1];
    if (path !== undefined) {
      file = path;
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk === null || file === "/dev/null") continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    // A pure deletion touches the line it follows.
    changed.set(file, [...(changed.get(file) ?? []), [start, Math.max(start, start + count - 1)]]);
  }
  return changed;
}

/** The lines where each test or describe starts, per file. A test runs until the next one starts. */
export function blockStarts(junit: string): Map<string, number[]> {
  const starts = new Map<string, number[]>();
  for (const match of junit.matchAll(/<(?:testcase|testsuite)\b([^>]*?)\/?>/g)) {
    const attributes = match[1] ?? "";
    const line = Number(attribute(attributes, "line"));
    if (!line) continue;
    const file = attribute(attributes, "file").replace(/^\.\//, "");
    starts.set(file, [...(starts.get(file) ?? []), line]);
  }
  for (const lines of starts.values()) lines.sort((a, b) => a - b);
  return starts;
}

/** Whether the diff changed a line of the test, from its first line to where the next test or describe starts. */
export function wasChanged(test: TestCase, starts: Map<string, number[]>, changed: Map<string, [number, number][]>): boolean {
  const end = (starts.get(test.file) ?? []).find((line) => line > test.line) ?? Infinity;
  return (changed.get(test.file) ?? []).some(([first, last]) => first < end && last >= test.line);
}

/** How many more `test(`/`it(` calls a diff adds than it removes. */
export function addedTestCount(diff: string): number {
  const call = /^[+-]\s*(?:test|it)(?:\.\w+)*\s*\(/;
  let count = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || !call.test(line)) continue;
    count += line.startsWith("+") ? 1 : -1;
  }
  return count;
}

/** The tests of one commit. */
export type TestResult = {
  failing: TestCase[];
  /** Failures not tied to a test: files that didn't load, errors between tests. */
  unattributed: number;
};

/** What's known about one commit. */
export type Facts = {
  kind: CommitKind;
  /** Test files the commit adds, changes, renames or deletes. */
  testFilesChanged: string[];
  /** The next commit's kind, null for the last commit, or "unknown" before it's made. */
  nextKind: CommitKind | null | "unknown";
  /** Null when the tests weren't run. */
  result: TestResult | null;
  /** Ids of the failing tests the commit added or changed. */
  changedFailing: string[];
  /** Whether the commit adds `test(` calls. */
  addsTests: boolean;
  multiRedApproved: boolean;
};

/** The rules the commit breaks. */
export function judge(facts: Facts): string[] {
  const { kind, testFilesChanged, result } = facts;
  const problems: string[] = [];
  const failing = result?.failing.map((test) => test.id) ?? [];

  if (result !== null && result.unattributed > 0) {
    problems.push(`${result.unattributed} failure(s) not tied to a test: a file didn't load, or an error was thrown between tests`);
  }
  if ((kind === "green" || kind === "other") && testFilesChanged.length > 0) {
    problems.push(`only 🔴, 🔴🔴 and ♻️ commits may change test files, but this one changes:\n${list(testFilesChanged)}`);
  }
  if ((kind === "green" || kind === "refactor") && failing.length > 0) {
    problems.push(`expected every test to pass, but ${failing.length} failed:\n${list(failing)}`);
  }
  if (kind !== "red" && kind !== "multi-red") return problems;

  if (facts.nextKind !== "green" && facts.nextKind !== "unknown") problems.push(`a ${kind === "red" ? "🔴" : "🔴🔴"} commit must be followed by a 🟢 commit`);
  if (failing.length === 0) {
    problems.push("expected a failing test, but none failed. A Docker test needs --docker.");
    return problems;
  }
  if (kind === "red" && failing.length > 1) {
    problems.push(`expected exactly one failing test, but ${failing.length} failed. Split them into 🔴/🟢 cycles:\n${list(failing)}`);
  }
  const unchanged = failing.filter((id) => !facts.changedFailing.includes(id));
  if (unchanged.length > 0) {
    problems.push(`these failing tests weren't added or changed by this commit:\n${list(unchanged)}`);
  }
  if (kind === "multi-red" && facts.addsTests) problems.push("🔴🔴 commits may only change existing expectations, but this one adds tests");
  if (kind === "multi-red" && !facts.multiRedApproved) problems.push("🔴🔴 commits need the PR to have the `multi-red-approved` label");
  return problems;
}

function list(items: string[]): string {
  return items.map((item) => `    - ${item}`).join("\n");
}
