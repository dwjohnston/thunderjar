import { opencode } from "thunderjar";

// OpenCode, on OpenRouter. OpenCode's built-in openrouter provider reads OPENROUTER_API_KEY itself.
// A test case names a model as "openrouter/" plus its OpenRouter ID, e.g. "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5".
// Models come and go: check https://openrouter.ai/models for the current IDs.
export default opencode({ version: "1.19.5", requiredEnv: ["OPENROUTER_API_KEY"] });
