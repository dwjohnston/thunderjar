import { OPENROUTER, copilot } from "thunderjar";

// GitHub Copilot CLI through OpenRouter, in BYOK mode. It needs only OPENROUTER_API_KEY, and names
// its models by OpenRouter's IDs. Copilot speaks the Responses API to OpenAI's models, and Chat
// Completions to the rest: `wireApi` tries both, e.g. "custom-copilot/openai/gpt-5.5/chat".
export default copilot({
  version: "1.0.105",
  provider: OPENROUTER,
  models: {
    "openai/gpt-5.5": [{ wireApi: { values: ["responses", "chat"] } }],
    "anthropic/claude-haiku-5.5": [],
  },
});
