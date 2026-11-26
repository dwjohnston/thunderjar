import { OPENROUTER, opencode } from "thunderjar";

// OpenCode through OpenRouter, as an OpenAI-compatible provider. It needs only OPENROUTER_API_KEY,
// and names its models by their IDs in the provider entry, e.g.
// "custom-opencode/openrouter/openai/gpt-5.5/high". Model settings are OpenCode's own config.
export default opencode({
  version: "1.19.5",
  provider: OPENROUTER,
  models: {
    "openrouter/openai/gpt-5.5": [{ options: { reasoningEffort: { values: ["low", "high"] } } }],
    "openrouter/anthropic/claude-haiku-5.5": [],
  },
});
