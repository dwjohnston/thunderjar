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

test("without a custom provider, which one it is doesn't apply", async () => {
  expect((await measured({ "src/api/openRouter.test.ts": "openrouter_only.ts" })).deepSeekProvider).toBeUndefined();
});

test("a DeepSeek baseUrl held in a variable is DeepSeek", async () => {
  expect(await measured({ "src/api/harness.test.ts": "deepseek_url_in_variable.ts" })).toEqual({ customProviderTest: true, deepSeekProvider: true });
});
