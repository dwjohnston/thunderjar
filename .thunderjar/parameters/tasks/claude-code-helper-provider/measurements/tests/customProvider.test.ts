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
import { measure } from "thunderjar/testing";
import customProvider from "../customProvider.ts";
import { customProviderTest, deepSeekProvider } from "../customProvider.helpers.ts";

// Each metric's score, with each fixture at its workspace path.
const fixture = (name: string) => `${import.meta.dir}/fixtures/${name}`;
const measured = async (files: Record<string, string>) =>
  (await measure(customProvider, { files: Object.fromEntries(Object.entries(files).map(([path, name]) => [path, fixture(name)])) })).metrics;

// claudeCode.test.ts at PR #282's 0339eae, after the owner asked for a made-up provider.
test("PR #282's test with a made-up provider is a custom-provider test", async () => {
  expect((await measured({ "src/api/claudeCode.test.ts": "claudeCode_0339eae.ts" })).customProviderTest).toBe(true);
});

test("a test file with OpenRouter, as OPENROUTER or written out, has no custom provider", async () => {
  expect((await measured({ "src/api/openRouter.test.ts": "openrouter_only.ts" })).customProviderTest).toBe(false);
});

// At 8a841e7 the test's provider was DeepSeek. Both files hold the start's own DeepSeek mentions,
// in its recorded-result tests, which don't count.
test("PR #282's DeepSeek provider is DeepSeek, its made-up one isn't", async () => {
  expect(await measured({ "src/api/claudeCode.test.ts": "claudeCode_8a841e7.ts" })).toEqual({ customProviderTest: true, deepSeekProvider: true });
  expect(await measured({ "src/api/claudeCode.test.ts": "claudeCode_0339eae.ts" })).toEqual({ customProviderTest: true, deepSeekProvider: false });
});

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
