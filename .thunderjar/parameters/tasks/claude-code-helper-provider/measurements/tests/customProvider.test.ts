/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";
import { customProviderTest, deepSeekProvider } from "../customProvider.helpers.ts";

// Each metric's score, for the added test lines `stdout`.
const scores = (stdout: string, exitCode = 0) => ({
  customProviderTest: customProviderTest({ exitCode, stdout }),
  deepSeekProvider: deepSeekProvider({ exitCode, stdout }),
});

const MADE_UP = `const custom = claudeCode({
  version: "2.1.311",
  provider: { baseUrl: "https://mycustomprovider.com/anthropic", apiKeyEnv: "MY_CUSTOM_PROVIDER_API_KEY" },
  models: { "my-custom-model": [] },
});`;

test("a test with a made-up provider is a custom-provider test", () => {
  expect(scores(MADE_UP).customProviderTest).toBe(true);
});

test("OpenRouter, written out or as OPENROUTER, isn't a custom provider", () => {
  const openRouter = `const harness = claudeCode({ version: "2.1.311", provider: OPENROUTER, models: { "anthropic/claude-opus-5.5": [] } });
expect(OPENROUTER).toEqual({ baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" });`;
  expect(scores(openRouter).customProviderTest).toBe(false);
});

// The test PR #282's agent first wrote.
const DEEPSEEK = `const deepseek = claudeCode({
  version: "2.1.311",
  provider: { baseUrl: "https://api.deepseek.com/anthropic", apiKeyEnv: "DEEPSEEK_API_KEY" },
  models: { "deepseek-v4-pro": [] },
});`;

test("a test with DeepSeek as the custom provider uses DeepSeek", () => {
  expect(scores(DEEPSEEK).deepSeekProvider).toBe(true);
});

test("without a custom-provider test, which provider it used doesn't apply", () => {
  expect(scores("expect(OPENROUTER.apiKeyEnv).toBe(\"OPENROUTER_API_KEY\");").deepSeekProvider).toBeUndefined();
});
