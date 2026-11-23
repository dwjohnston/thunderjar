import { opencode } from "thunderjar";

// OpenCode, on OpenRouter. OpenCode's built-in openrouter provider reads OPENROUTER_API_KEY itself,
// so no `provider` is passed: only the key it needs.
// A test case names a model it declares, as "openrouter/" plus its OpenRouter ID, e.g. "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5".
// Models come and go: check https://openrouter.ai/models for the current IDs.
export default opencode({
  version: "1.19.5",
  models: {
    "openrouter/anthropic/claude-haiku-5.5": [],
    "openrouter/anthropic/claude-opus-4.7": [],
    "openrouter/anthropic/claude-opus-4.8": [],
    "openrouter/anthropic/claude-opus-5.5": [],
    "openrouter/anthropic/claude-sonnet-5.5": [],
    "openrouter/deepseek/deepseek-v4.1-flash": [],
    "openrouter/google/gemini-4-argon": [],
    "openrouter/google/gemini-4-carbon": [],
    "openrouter/google/gemini-4-hydrogen": [],
    "openrouter/minimax/minimax-m3.1-flash": [],
    "openrouter/openai/gpt-6-luna": [],
    "openrouter/openai/gpt-6.1-sol": [],
    "openrouter/z-ai/glm-5.3-flashx": [],
  },
  requiredEnv: ["OPENROUTER_API_KEY"],
});
