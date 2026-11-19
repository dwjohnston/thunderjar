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
import { describe, expect, test } from "bun:test";
import { blockStarts, changedLines, commitKind, isTestFile, summaryFailCount, type TestCase, testCases, wasChanged } from "./red-green.ts";

describe("commitKind", () => {
  test("reads the marker after a prefix", () => {
    expect(commitKind("🤖 Claude: 🔴 A variable passed with -e is in the postrun image")).toBe("red");
    expect(commitKind("🤖 Claude: 🔴🔴 Update expectations for 1-based line numbers")).toBe("multi-red");
    expect(commitKind("🟢 Blank what the prerun image doesn't set")).toBe("green");
    expect(commitKind("♻️ Refactor format handling into a reporters map")).toBe("refactor");
    expect(commitKind("Test support: the fake Docker models environments")).toBe("other");
  });

  test("ignores a marker the subject only mentions", () => {
    expect(commitKind("🤖 Claude: Let a 🔴🔴 commit fail several tests")).toBe("other");
    expect(commitKind("Explain 🟢 commits in AGENTS.md")).toBe("other");
  });

  test("reads a marker at the start, with a colon in the rest", () => {
    expect(commitKind("🔴 Docs: the link is broken")).toBe("red");
  });
});

describe("isTestFile", () => {
  test("is a test file, or a test's expected result", () => {
    expect(isTestFile("src/cli/commands/run/run.test.ts")).toBe(true);
    expect(isTestFile("src/docker/docker.docker.test.ts")).toBe(true);
    expect(isTestFile("src/cli/commands/view/app/ErrorBoundary.test.tsx")).toBe(true);
    expect(isTestFile("src/api/claudeCode.deepseek.result.json")).toBe(true);
    expect(isTestFile("src/testing/thunderjar.ts")).toBe(false);
  });

  test("leaves out the gauntlet's challenges", () => {
    expect(isTestFile("src/gauntlet/wrong-failing-test/test/retail/money.test.js")).toBe(false);
  });
});

// As `bun test --reporter=junit` writes it.
const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" assertions="2" failures="1" skipped="0" time="0.005">
  <testsuite name="a.test.ts" file="a.test.ts" tests="3" assertions="2" failures="1" skipped="0" time="0.001" hostname="vm">
    <testsuite name="outer" file="a.test.ts" line="3" tests="3" assertions="2" failures="1" skipped="0" time="0" hostname="vm">
      <testsuite name="inner" file="a.test.ts" line="4" tests="1" assertions="1" failures="1" skipped="0" time="0" hostname="vm">
        <testcase name="keeps &quot;quotes&quot; &amp; ampersands" classname="inner &gt; outer" time="0.0002" file="a.test.ts" line="5" assertions="1">
          <failure type="AssertionError" message="expect(received).toBe(expected)">AssertionError</failure>
        </testcase>
      </testsuite>
      <testcase name="passes" classname="outer" time="0.000006" file="a.test.ts" line="10" assertions="0" />
      <testcase name="is skipped" classname="outer" time="0" file="a.test.ts" line="14" assertions="0">
        <skipped />
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>`;

describe("testCases", () => {
  test("names each test by file, describes outermost first, and name", () => {
    expect(testCases(JUNIT)).toEqual([
      { id: `a.test.ts: outer > inner > keeps "quotes" & ampersands`, file: "a.test.ts", line: 5, failing: true },
      { id: "a.test.ts: outer > passes", file: "a.test.ts", line: 10, failing: false },
      { id: "a.test.ts: outer > is skipped", file: "a.test.ts", line: 14, failing: false },
    ]);
  });
});

describe("summaryFailCount", () => {
  test("reads the fail line, which counts files that didn't load", () => {
    expect(summaryFailCount(" 1 pass\n 3 fail\n 2 errors\n 1 expect() calls\nRan 4 tests across 3 files.")).toBe(3);
  });
});

const DIFF = `diff --git a/a.test.ts b/a.test.ts
index 1111111..2222222 100644
--- a/a.test.ts
+++ b/a.test.ts
@@ -11 +11 @@ describe("outer", () => {
-    expect(1).toBe(1);
+    expect(1).toBe(2);
@@ -20,0 +21,3 @@
+  test("new", () => {
+    expect(1).toBe(2);
+  });
@@ -30,2 +33,0 @@
-  it("gone", () => {});
-  // gone
`;

describe("changedLines", () => {
  test("reads each hunk's lines in the new version", () => {
    expect(changedLines(DIFF)).toEqual(
      new Map([
        [
          "a.test.ts",
          [
            [11, 11],
            [21, 23],
            [33, 33],
          ],
        ],
      ]),
    );
  });
});

describe("wasChanged", () => {
  const starts = blockStarts(JUNIT);
  const at = (line: number): TestCase => ({ id: "t", file: "a.test.ts", line, failing: true });

  test("is true when a changed line is between the test's start and the next block's", () => {
    expect(wasChanged(at(10), starts, changedLines(DIFF))).toBe(true);
  });
});
