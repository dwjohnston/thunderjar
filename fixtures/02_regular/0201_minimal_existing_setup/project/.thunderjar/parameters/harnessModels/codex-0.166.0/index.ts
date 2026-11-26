import { codex } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox. It needs
// OPENAI_API_KEY. A test case may name any of OpenAI's models it declares, with a reasoning
// effort, after the folder, e.g. "codex-0.166.0/gpt-5.5/medium". To name others, pass `models`.
// To run it on OpenRouter, pass `provider: OPENROUTER` too, with OpenRouter's model IDs.
export default codex({ version: "0.166.0" });
