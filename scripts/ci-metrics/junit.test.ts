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

import { expect, test } from "bun:test";
import { parseJunit } from "./junit";

// Trimmed from a real `bun test --reporter=junit` run.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="4" assertions="1" failures="1" skipped="2" time="1.846047158">
  <testsuite name="a.test.ts" file="a.test.ts" tests="4" time="0.0015" hostname="vm">
    <testsuite name="outer" file="a.test.ts" line="2" tests="2" time="0" hostname="vm">
      <testsuite name="inner" file="a.test.ts" line="2" tests="2" time="0" hostname="vm">
        <testcase name="fails" classname="inner &gt; outer" time="0.000391" file="a.test.ts" line="2" assertions="1">
          <failure type="AssertionError" message="Expected: 2">AssertionError</failure>
        </testcase>
        <testcase name="the model&apos;s &quot;name&quot;" classname="inner &gt; outer" time="0.25" file="a.test.ts" line="3" assertions="1" />
      </testsuite>
    </testsuite>
    <testcase name="skipped" classname="" time="0" file="a.test.ts" line="4" assertions="0">
      <skipped />
    </testcase>
  </testsuite>
  <testsuite name="b.test.ts" file="b.test.ts" tests="1" time="2" hostname="vm">
    <testcase name="slow" classname="" time="1.5" file="b.test.ts" line="1" assertions="1" />
  </testsuite>
</testsuites>`;

test("reads each test's file, describe path, duration and status, and the runner's total time", () => {
  expect(parseJunit(xml)).toEqual({
    totalSeconds: 1.846047158,
    tests: [
      { file: "a.test.ts", name: "outer > inner > fails", durationMs: 0.391, status: "failed" },
      { file: "a.test.ts", name: `outer > inner > the model's "name"`, durationMs: 250, status: "passed" },
      { file: "a.test.ts", name: "skipped", durationMs: 0, status: "skipped" },
      { file: "b.test.ts", name: "slow", durationMs: 1500, status: "passed" },
    ],
  });
});
