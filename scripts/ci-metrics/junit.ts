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

export function parseJunit(_xml: string): JunitReport {
  return { totalSeconds: 0, tests: [] };
}
