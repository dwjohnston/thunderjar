import { copilot, copilotCommand } from "thunderjar";

// GitHub Copilot CLI, in BYOK mode on OpenRouter: setting COPILOT_PROVIDER_BASE_URL makes it skip
// GitHub auth and Copilot's model routing. It needs OPENROUTER_API_KEY.
// A test case names a model by its OpenRouter ID, e.g. "copilot-1.0.105/anthropic/claude-haiku-5.5".
// The part after the last "/" is also given as the well-known model ID, so Copilot applies its
// model-specific settings (tool support, token limits). Run `copilot help providers` for the details.
// Models come and go: check https://openrouter.ai/models for the current IDs.

/**
 * OpenAI's models get OpenRouter's Responses API. On Chat Completions, Copilot sends a tool without
 * a `name`, and OpenAI rejects every request: 400 "Missing required parameter: 'tools[4].name'"
 * (gauntlet smoke run 6, openai/gpt-6.1-sol). Other providers keep Copilot's default.
 */
const wireApi = (modelId: string) => (modelId.startsWith("openai/") ? " COPILOT_PROVIDER_WIRE_API=responses" : "");

export default copilot({
  version: "1.0.105",
  command: ({ modelId }) =>
    copilotCommand(
      `COPILOT_PROVIDER_BASE_URL=https://openrouter.ai/api/v1 COPILOT_PROVIDER_API_KEY="$OPENROUTER_API_KEY"` +
        ` COPILOT_PROVIDER_MODEL_ID=${modelId.split("/").pop()}${wireApi(modelId)}`,
    ),
  requiredEnv: ["OPENROUTER_API_KEY"],
});
