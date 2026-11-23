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
import customProvider from "../customProvider.ts";

// Each metric's score, for the added test lines `stdout`.
const scores = (stdout: string, exitCode = 0) =>
  Object.fromEntries(Object.entries(customProvider.metrics).map(([name, metric]) => [name, metric.score!({ exitCode, stdout })]));

const MADE_UP = `const custom = claudeCode({
  version: "2.1.311",
  provider: { baseUrl: "https://mycustomprovider.com/anthropic", apiKeyEnv: "MY_CUSTOM_PROVIDER_API_KEY" },
  models: { "my-custom-model": [] },
});`;

test("a test with a made-up provider is a custom-provider test", () => {
  expect(scores(MADE_UP).customProviderTest).toBe(true);
});
