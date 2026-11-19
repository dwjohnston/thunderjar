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
// Enforces the red/green TDD commit workflow of the red-green-tdd skill, commit by commit.
//
//   bun scripts/red-green.ts --base origin/main --head HEAD [--docker] [--multi-red-approved]
//
// The marker starts a commit's subject, or follows a `prefix: ` such as `🤖 Claude: `.
//
// - 🔴: exactly one test fails, on an assertion, and the commit added or changed it.
// - 🔴🔴: at least one test fails, and the commit changed every failing test. It adds no tests,
//   and needs --multi-red-approved (CI passes it for a PR with the `multi-red-approved` label).
// - A 🔴 or 🔴🔴 commit is followed by a 🟢 commit.
// - 🟢: touches no test file, and every test passes.
// - ♻️: may change test files, and every test passes.
// - No marker: touches no test file. Its tests aren't run: the CI check job runs them at the head.
// - A failure not tied to a test, e.g. a file that doesn't load, fails any commit.
//
// Tests run in a temporary git worktree, so this checkout is never touched. --docker also runs the
// `.docker.test.ts` files the branch changes. Merge commits are skipped.
//
// Exits 1 if any commit breaks a rule.
import { $ } from "bun";

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

function option(name: string, fallback: string): string {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? fallback : (Bun.argv[index + 1] ?? fallback);
}

/** The failure count in `bun test`'s summary, which also counts files that didn't load. */
export function summaryFailCount(output: string): number {
  return Number(/^\s*(\d+) fail$/m.exec(output)?.[1] ?? 0);
}

/** Runs `bun test` in `dir`. Returns its tests, and their failures not tied to a test. */
async function runTests(dir: string, report: string, args: string[], env: Record<string, string> = {}) {
  const output = await $`bun test ${args} --reporter=junit --reporter-outfile=${report}`.cwd(dir).env({ ...Bun.env, ...env }).nothrow().quiet();
  const junit = (await Bun.file(report).exists()) ? await Bun.file(report).text() : "";
  const cases = testCases(junit);
  const failing = cases.filter((test) => test.failing);
  // A non-zero exit with nothing in the summary, e.g. bun itself failed, is a failure too.
  const failCount = Math.max(summaryFailCount(output.stdout.toString() + output.stderr.toString()), output.exitCode === 0 ? 0 : 1);
  return { junit, failing, unattributed: Math.max(0, failCount - failing.length) };
}

async function lines(command: ReturnType<typeof $>): Promise<string[]> {
  return (await command.text()).split("\n").filter(Boolean);
}

/** What running a commit's tests shows. */
type Examined = Pick<Facts, "result" | "changedFailing" | "addsTests">;

/**
 * Runs the tests in `dir`, a copy of the commit, and works out which failing tests the commit
 * changed. `diff` gives the commit's `git diff` of the files it's passed, with the extra args.
 */
async function examine(
  dir: string,
  report: string,
  kind: CommitKind,
  testFilesChanged: string[],
  dockerFiles: string[],
  diff: (args: string[]) => Promise<string>,
): Promise<Examined> {
  const runs = [await runTests(dir, `${report}.xml`, ["--parallel"])];
  const present: string[] = [];
  for (const file of dockerFiles) {
    if (await Bun.file(`${dir}/${file}`).exists()) present.push(`./${file}`);
  }
  if (present.length > 0) {
    runs.push(await runTests(dir, `${report}.docker.xml`, ["--timeout", "600000", ...present], { THUNDERJAR_DOCKER_TESTS: "1" }));
  }
  const result = { failing: runs.flatMap((run) => run.failing), unattributed: runs.reduce((sum, run) => sum + run.unattributed, 0) };
  if ((kind !== "red" && kind !== "multi-red") || testFilesChanged.length === 0) return { result, changedFailing: [], addsTests: false };

  const changes = await diff(["-U0", "--no-color", "--", ...testFilesChanged]);
  const starts = blockStarts(runs.map((run) => run.junit).join("\n"));
  const changed = changedLines(changes);
  return {
    result,
    changedFailing: result.failing.filter((test) => wasChanged(test, starts, changed)).map((test) => test.id),
    addsTests: addedTestCount(changes) > 0,
  };
}

/** Prints a commit's outcome. Returns its problems, labelled, or null if it has none. */
function report(label: string, problems: string[], result: TestResult | null): string | null {
  if (problems.length === 0) {
    const outcome = result === null ? "no test files changed" : result.failing.length === 0 ? "all pass" : `failing: ${result.failing.map((test) => test.id).join(", ")}`;
    console.log(`  ✅ ${outcome}`);
    return null;
  }
  for (const problem of problems) console.log(`  ❌ ${problem}`);
  return `${label}\n${problems.map((problem) => `  ${problem}`).join("\n")}`;
}

function tempDir(): string {
  return `${Bun.env.TMPDIR || "/tmp"}/thunderjar-red-green-${crypto.randomUUID()}`;
}

/** Checks each commit of base..head. */
async function checkBranch(): Promise<string[]> {
  const base = option("--base", "origin/main");
  const head = option("--head", "HEAD");
  const docker = Bun.argv.includes("--docker");
  const multiRedApproved = Bun.argv.includes("--multi-red-approved");

  const commits = await Promise.all(
    (await lines($`git rev-list --reverse --first-parent ${base}..${head}`)).map(async (sha) => {
      const subject = (await $`git log -1 --format=%s ${sha}`.text()).trim();
      const isMerge = (await $`git rev-list --parents -n 1 ${sha}`.text()).trim().split(" ").length > 2;
      return { sha, subject, kind: commitKind(subject), isMerge };
    }),
  );
  const checked = commits.filter((commit) => !commit.isMerge);
  const dockerFiles = docker ? (await lines($`git diff --name-only ${base}...${head}`)).filter((file) => file.endsWith(".docker.test.ts")) : [];

  const temp = tempDir();
  const worktree = `${temp}/worktree`;
  let hasWorktree = false;
  const problems: string[] = [];
  try {
    for (const [index, commit] of checked.entries()) {
      const label = `${commit.sha.slice(0, 7)} ${commit.subject}`;
      console.log(`\n${label}`);
      const testFilesChanged = (await lines($`git diff --name-only --no-renames ${commit.sha}^ ${commit.sha}`)).filter(isTestFile);

      let examined: Examined = { result: null, changedFailing: [], addsTests: false };
      if (commit.kind !== "other") {
        if (!hasWorktree) {
          await $`git worktree add --detach ${worktree} ${commit.sha}`.quiet();
          hasWorktree = true;
        }
        await $`git checkout --detach --force --quiet ${commit.sha}`.cwd(worktree);
        await $`git clean -fdq`.cwd(worktree);
        await $`bun install --frozen-lockfile`.cwd(worktree).quiet();
        examined = await examine(worktree, `${temp}/${commit.sha}`, commit.kind, testFilesChanged, dockerFiles, (args) =>
          $`git diff ${commit.sha}^ ${commit.sha} ${args}`.text(),
        );
      }

      const next = checked[index + 1];
      const nextKind = next === undefined ? null : next.kind;
      const problem = report(label, judge({ kind: commit.kind, testFilesChanged, nextKind, multiRedApproved, ...examined }), examined.result);
      if (problem !== null) problems.push(problem);
    }
  } finally {
    if (hasWorktree) await $`git worktree remove --force ${worktree}`.nothrow().quiet();
    await $`rm -rf ${temp}`.nothrow().quiet();
  }
  if (problems.length === 0) console.log(`\nAll ${checked.length} commits follow the red/green rules.`);
  return problems;
}

/**
 * Checks the commit being made, for the commit-msg hook: the message in `messageFile`, and what's
 * staged. With --amend, the changes are those of the amended commit, from HEAD's parent.
 */
async function checkStaged(messageFile: string): Promise<string[]> {
  const subject =
    (await Bun.file(messageFile).text())
      .split("\n")
      .find((line) => line.trim() !== "" && !line.startsWith("#"))
      ?.trim() ?? "";
  const kind = commitKind(subject);
  const base = Bun.argv.includes("--amend") ? "HEAD^" : "HEAD";
  if ((await $`git rev-parse --verify --quiet ${base}`.nothrow().quiet()).exitCode !== 0) return [];

  const testFilesChanged = (await lines($`git diff --cached --name-only --no-renames ${base}`)).filter(isTestFile);
  const label = `The commit being made: ${subject}`;
  console.log(label);
  if (kind === "other") {
    const problem = report(label, judge({ kind, testFilesChanged, nextKind: "unknown", result: null, changedFailing: [], addsTests: false, multiRedApproved: true }), null);
    return problem === null ? [] : [problem];
  }

  // The staged files, not the working folder, which may hold changes that aren't being committed.
  const temp = tempDir();
  const copy = `${temp}/staged`;
  console.log("  Running the tests on the staged files. Set THUNDERJAR_SKIP_RED_GREEN_HOOK=1 to skip.");
  try {
    await $`git checkout-index --all --prefix=${copy}/`;
    await $`bun install --frozen-lockfile`.cwd(copy).quiet();
    const docker = (await $`docker info`.nothrow().quiet()).exitCode === 0;
    const dockerFiles = docker ? testFilesChanged.filter((file) => file.endsWith(".docker.test.ts")) : [];
    const examined = await examine(copy, `${temp}/report`, kind, testFilesChanged, dockerFiles, (args) => $`git diff --cached ${base} ${args}`.text());
    // The multi-red-approved label is a PR's, so only CI checks it.
    const problem = report(label, judge({ kind, testFilesChanged, nextKind: "unknown", multiRedApproved: true, ...examined }), examined.result);
    return problem === null ? [] : [problem];
  } finally {
    await $`rm -rf ${temp}`.nothrow().quiet();
  }
}

async function main(): Promise<void> {
  const staged = Bun.argv.indexOf("--staged");
  const messageFile = staged === -1 ? undefined : Bun.argv[staged + 1];
  const problems = messageFile === undefined ? await checkBranch() : await checkStaged(messageFile);
  if (problems.length > 0) {
    console.error(`\n${problems.length} commit(s) break the red/green rules:\n\n${problems.join("\n\n")}`);
    if (messageFile !== undefined) console.error("\nSet THUNDERJAR_SKIP_RED_GREEN_HOOK=1 to commit anyway.");
    process.exit(1);
  }
}

if (import.meta.main) await main();
