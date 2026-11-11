/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 59b8836a-3b3e-41c0-9575-a82add14e327
 * Supervising engineer: blacksheep-bot
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { describe, expect, test } from "bun:test";
import type { ExecutionRecord } from "../../../store/runDataStore.ts";
import { painter, unstyled } from "../../colour.ts";
import { renderExecutions } from "./executions.ts";

const record = (executionId: string, testCase: string, status: ExecutionRecord["status"]): ExecutionRecord => ({
  executionId,
  testCase,
  task: "is-prime",
  startedAt: "2026-11-11T04:00:00.000Z",
  status,
  matrix: { shape: [1], permutations: 2, iterations: 1 },
});

describe("renderExecutions in colour", () => {
  const executions = [record("01AAA", "example", "complete"), record("01BBB", "two-harnesses", "failed")];

  test("lines up its columns as it does without colour", () => {
    expect(unstyled(renderExecutions(executions, painter({}, true)))).toBe(renderExecutions(executions));
  });

  test("colours each status", () => {
    const rendered = renderExecutions(executions, painter({}, true));

    expect(rendered).toContain("\x1b[32mcomplete\x1b[39m");
    expect(rendered).toContain("\x1b[31mfailed\x1b[39m");
  });
});
