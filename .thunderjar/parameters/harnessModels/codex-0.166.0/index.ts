import { codex, OPENROUTER } from "thunderjar";

// OpenAI's Codex CLI, on OpenRouter, without its sandbox or approvals: the container is the sandbox.
// OpenRouter is set up as a model provider, on its Responses API. It needs OPENROUTER_API_KEY.
// A test case names a model it declares, by its OpenRouter ID, e.g. "codex-0.166.0/openai/gpt-6-luna/medium".
// Models come and go: check https://openrouter.ai/models for the current IDs.
export default codex({
  version: "0.166.0",
  provider: OPENROUTER,
  // A pair names the reasoning effort too, e.g. "codex-0.166.0/openai/gpt-6-luna/medium": Codex's default is medium.
  models: {
    "openai/gpt-6-luna": [{ reasoningEffort: { values: ["low", "medium", "high"] } }],
  },
});
