/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLihXvsaKQZdBjhN81n
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";
// The repo's own OpenCode harness, in .thunderjar/, which `bun test` doesn't search.
import opencode from "../../.thunderjar/parameters/harnessModels/opencode-1.19.5/index.ts";

const ctx = { version: "1.19.5", modelId: "openrouter/z-ai/glm-5.3-flashx" };
const collect = (raw: string) => opencode.collectTokenCosts?.(raw, ctx);

test("a run whose first model call failed, e.g. OpenRouter's 402, reported no tokens: notReported", () => {
  // Cut down from a gauntlet run's result.json: OpenCode's error event, and no step_finish.
  const raw = `${JSON.stringify({ type: "error", timestamp: 1, sessionID: "s", error: { name: "APIError", data: { statusCode: 402, isRetryable: false } } })}\n`;
  expect(collect(raw)).toEqual({ outcome: "unavailable", reason: "notReported" });
});

test("output with no OpenCode events at all is unparseable", () => {
  expect(collect("Error: something went wrong\n")).toEqual({ outcome: "unavailable", reason: "unparseable" });
});

test("each step's tokens are summed, reasoning counted as output", () => {
  const step = { type: "step_finish", part: { cost: 0.01, tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } } } };
  expect(collect(`${JSON.stringify(step)}\n${JSON.stringify(step)}\n`)).toEqual({
    outcome: "collected",
    models: [{ model: ctx.modelId, inputTokens: 20, outputTokens: 14, cacheReadTokens: 6, cacheCreationTokens: 2, costUsd: 0.02, costBasis: "list" }],
  });
});
