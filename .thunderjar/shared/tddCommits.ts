/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Helpers for the tdd-* tasks' measurements: what the red-green-tdd skill's commit markers say,
// and how a challenge's tests did at each commit the agent made.

/** A commit's marker, from the red-green-tdd skill: the emoji its message starts with. */
export type Marker = "red" | "redRed" | "green" | "refactor" | "none";

export function markerOf(message: string): Marker {
  const text = message.trimStart();
  if (text.startsWith("🔴🔴")) return "redRed";
  if (text.startsWith("🔴")) return "red";
  if (text.startsWith("🟢")) return "green";
  // ♻️ is ♻ and a variation selector, which agents sometimes leave out.
  if (text.startsWith("♻")) return "refactor";
  return "none";
}

/** How a challenge's tests did at one commit. */
export type CommitTests = { sha: string; pass: number; fail: number; marker: Marker; subject: string };

/**
 * A shell command that runs the tests of the challenge in `dir` at each commit from
 * refs/thunderjar/start to HEAD, oldest first, each in a fresh copy of that commit's `dir`, and
 * prints a line per commit: short SHA, passed, failed, subject, tab-separated. Prints nothing when
 * the agent made no commits.
 */
export function commitTestsCommand(dir: string): string {
  return `for sha in $(git rev-list --reverse refs/thunderjar/start..HEAD); do
  tmp=$(mktemp -d)
  git archive "$sha" ${dir} | tar -x -C "$tmp"
  out=$(cd "$tmp/${dir}" 2>/dev/null && timeout 120 node --test --test-reporter=tap 2>&1)
  pass=$(printf '%s\\n' "$out" | sed -n 's/^# pass //p')
  fail=$(printf '%s\\n' "$out" | sed -n 's/^# fail //p')
  [ -z "$pass$fail" ] && fail=1
  printf '%s\\t%s\\t%s\\t%s\\n' "$(git rev-parse --short "$sha")" "\${pass:-0}" "\${fail:-0}" "$(git log -1 --format=%s "$sha")"
  rm -rf "$tmp"
done`;
}

/** Parses what `commitTestsCommand` printed. */
export function parseCommitTests(stdout: string): CommitTests[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [sha = "", pass = "0", fail = "0", ...subject] = line.split("\t");
      const text = subject.join("\t");
      return { sha, pass: Number(pass), fail: Number(fail), marker: markerOf(text), subject: text };
    });
}

/** Whether `check` holds for every one of `items`, or undefined when there are none to check. */
export function every<T>(items: T[], check: (item: T) => boolean): boolean | undefined {
  return items.length === 0 ? undefined : items.every(check);
}

/** Whether `path` is one of a challenge's tests: in a `test/` folder, or named `*.test.*`. */
export const isTestFile = (path: string) => /(^|\/)test\//.test(path) || /\.test\.[cm]?[jt]s$/.test(path);
