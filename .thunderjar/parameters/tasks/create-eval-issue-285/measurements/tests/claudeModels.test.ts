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
