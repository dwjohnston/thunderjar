// OpenRouter as the provider, as OPENROUTER and written out: no custom provider.
import { expect, test } from "bun:test";
import { claudeCode, OPENROUTER } from "./claudeCode.ts";

test("OpenRouter", () => {
  const harness = claudeCode({ version: "2.1.311", provider: OPENROUTER, models: { "anthropic/claude-opus-5.5": [] } });
  expect(harness.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
  expect(OPENROUTER).toEqual({ baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" });
});
