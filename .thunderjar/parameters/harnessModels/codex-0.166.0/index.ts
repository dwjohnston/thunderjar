import { codex } from "thunderjar";

// OpenAI's Codex CLI, on OpenRouter, without its sandbox or approvals: the container is the sandbox.
// A custom model provider points Codex at OpenRouter's Responses API. It needs OPENROUTER_API_KEY.
// A test case names a model by its OpenRouter ID, e.g. "codex-0.166.0/openai/gpt-5.5".
// Models come and go: check https://openrouter.ai/models for the current IDs.
const OPENROUTER_PROVIDER =
  `-c model_provider=openrouter` +
  ` -c 'model_providers.openrouter={name="OpenRouter",base_url="https://openrouter.ai/api/v1",env_key="OPENROUTER_API_KEY",wire_api="responses"}'`;

export default codex({
  version: "0.166.0",
  command: `codex exec ${OPENROUTER_PROVIDER} --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
  requiredEnv: ["OPENROUTER_API_KEY"],
});
