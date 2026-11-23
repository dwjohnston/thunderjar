// A DeepSeek provider whose baseUrl is held in a variable.
import { expect, test } from "bun:test";
import { claudeCode } from "./claudeCode.ts";

const DEEPSEEK_URL = "https://api.deepseek.com/anthropic";

test("DeepSeek", () => {
  const harness = claudeCode({
    version: "2.1.311",
    provider: { baseUrl: DEEPSEEK_URL, apiKeyEnv: "DEEPSEEK_API_KEY" },
    models: { "deepseek-chat": [] },
  });
  expect(harness.requiredEnv).toEqual(["DEEPSEEK_API_KEY"]);
});
