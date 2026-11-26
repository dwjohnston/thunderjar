import { OPENROUTER, codex } from "thunderjar";

// Codex through OpenRouter, which speaks OpenAI's Responses API. It needs only
// OPENROUTER_API_KEY, and names its models by OpenRouter's IDs, e.g.
// "custom-codex/openai/gpt-6.1-sol/high".
export default codex({
  version: "0.166.0",
  provider: OPENROUTER,
  models: {
    "openai/gpt-6.1-sol": [{ reasoningEffort: { values: ["low", "high"] } }],
    "openai/gpt-5.5": [],
  },
});
