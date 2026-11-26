import { copilot, OPENROUTER } from "thunderjar";

// GitHub Copilot CLI, in BYOK mode on OpenRouter: setting COPILOT_PROVIDER_BASE_URL makes it skip
// GitHub auth and Copilot's model routing. It needs OPENROUTER_API_KEY.
// A test case names a model it declares, by its OpenRouter ID, e.g. "copilot-1.0.105/anthropic/claude-haiku-5.5".
// OpenAI's models go on OpenRouter's Responses API: on Chat Completions, OpenAI rejects Copilot's tool list.
// Models come and go: check https://openrouter.ai/models for the current IDs.
export default copilot({
  version: "1.0.105",
  provider: OPENROUTER,
  models: {
    "anthropic/claude-haiku-5.5": [],
    "anthropic/claude-sonnet-5.5": [],
    "deepseek/deepseek-v4.1-flash": [],
    "google/gemini-4-neon": [],
    "mistralai/mistral-large-4-0": [],
    "moonshotai/kimi-k3.1-pro": [],
    "openai/gpt-6.1-sol": [],
    "openai/gpt-6.1-terra": [],
    "openai/gpt-6.1-terra-pro": [],
    "openai/gpt-6.2-astra": [],
    "openai/gpt-6.2-astra-pro": [],
    "openai/gpt-6.2-sol": [],
    "openai/gpt-6.2-sol-pro": [],
    "qwen/qwen4-max": [],
    "x-ai/grok-4.7": [],
    "z-ai/glm-5.3-prime": [],
  },
});
