import { codex } from "thunderjar";

// OpenAI's Codex CLI, on OpenRouter, without its sandbox or approvals: the container is the sandbox.
// `openRouter` points Codex at OpenRouter's Responses API. It needs OPENROUTER_API_KEY.
// A test case names a model by its OpenRouter ID, e.g. "codex-0.166.0/openai/gpt-5.5".
// Models come and go: check https://openrouter.ai/models for the current IDs.
export default codex({ version: "0.166.0", openRouter: true });
