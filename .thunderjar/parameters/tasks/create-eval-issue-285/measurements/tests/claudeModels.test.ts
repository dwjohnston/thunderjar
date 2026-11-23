/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";
import { measure } from "thunderjar/testing";
import claudeModels from "../claudeModels.ts";

const TEST_CASES = ".thunderjar/test-cases";
const fixture = (name: string) => `${import.meta.dir}/fixtures/${name}`;

// This task's own test case, as if the agent had written it: Haiku, Sonnet and Opus.
test("a test case on Haiku, Sonnet and Opus uses all three Claude models", async () => {
  const files = { [`${TEST_CASES}/create-eval-issue-285.ts`]: `${import.meta.dir}/../../../../../test-cases/create-eval-issue-285.ts` };
  expect((await measure(claudeModels, { files })).metrics).toEqual({ claudeModels: 3, allThreeClaudeModels: true });
});

// PR #288's test case, Haiku only: the same at its first version and its head. tdd-red-green-on-simple-task.ts
// was already there at the start, on all three, so it doesn't count.
test("PR #288's test case uses one Claude model, beside the start's own test case on all three", async () => {
  const files = {
    [`${TEST_CASES}/claude-code-helper-provider.ts`]: fixture("pr288-head/claude-code-helper-provider.ts"),
    [`${TEST_CASES}/tdd-red-green-on-simple-task.ts`]: fixture("start/tdd-red-green-on-simple-task.ts"),
  };
  expect((await measure(claudeModels, { files })).metrics).toEqual({ claudeModels: 1, allThreeClaudeModels: false });
});

test("models named in template strings count", async () => {
  const files = { [`${TEST_CASES}/new.ts`]: fixture("template-models.ts") };
  expect((await measure(claudeModels, { files })).metrics).toEqual({ claudeModels: 3, allThreeClaudeModels: true });
});

test("without a test case the agent added, which models it uses doesn't apply", async () => {
  const files = { [`${TEST_CASES}/tdd-red-green-on-simple-task.ts`]: fixture("start/tdd-red-green-on-simple-task.ts") };
  expect((await measure(claudeModels, { files })).metrics).toEqual({ claudeModels: undefined, allThreeClaudeModels: undefined });
});
