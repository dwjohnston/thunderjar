/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: (see session)
 * Session Id: session_01LCLeLhdFSg6pjhA6B8LSGh
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Reads the JUnit XML that `bun test --reporter=junit` writes.

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestTiming {
  file: string;
  /** The describe blocks and the test's name, joined with " > ". */
  name: string;
  durationMs: number;
  status: TestStatus;
}

export interface JunitReport {
  /** The test runner's own wall-clock time, in seconds. */
  totalSeconds: number;
  tests: TestTiming[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, ref: string) => {
    if (ref.startsWith("#x") || ref.startsWith("#X")) return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith("#")) return String.fromCodePoint(parseInt(ref.slice(1), 10));
    return ENTITIES[ref] ?? whole;
  });
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, key, value] of source.matchAll(/([\w:-]+)="([^"]*)"/g)) result[key!] = decode(value!);
  return result;
}

/**
 * Bun nests a testsuite per file, then one per describe block. Its classname joins the describe
 * blocks innermost first, so the name is built from the nesting instead.
 */
export function parseJunit(xml: string): JunitReport {
  const tags = /<(\/?)(testsuites|testsuite|testcase|failure|error|skipped)\b((?:[^>"]|"[^"]*")*?)(\/?)>/g;
  const suites: string[] = [];
  const tests: TestTiming[] = [];
  let totalSeconds = 0;
  let open: TestTiming | undefined;

  for (const [, closing, tag, attrs, selfClosing] of xml.matchAll(tags)) {
    if (closing) {
      if (tag === "testsuite") suites.pop();
      if (tag === "testcase") open = undefined;
      continue;
    }
    const a = attributes(attrs!);
    if (tag === "testsuites") totalSeconds = Number(a.time ?? 0);
    else if (tag === "testsuite") {
      if (!selfClosing) suites.push(a.name ?? "");
    } else if (tag === "testcase") {
      // The outermost suite is the file, which has its own column.
      const name = [...suites.slice(1), a.name ?? ""].join(" > ");
      const timing: TestTiming = { file: a.file ?? suites[0] ?? "", name, durationMs: Number(a.time ?? 0) * 1000, status: "passed" };
      tests.push(timing);
      if (!selfClosing) open = timing;
    } else if (open) {
      open.status = tag === "skipped" ? "skipped" : "failed";
    }
  }
  return { totalSeconds, tests };
}
