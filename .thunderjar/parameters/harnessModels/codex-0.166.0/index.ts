import { declareHarness, writeModel, writeRunScript } from "thunderjar-published";

// OpenAI's Codex CLI, on OpenRouter, without its sandbox or approvals: the container is the sandbox.
// A custom model provider points Codex at OpenRouter's Responses API. It needs OPENROUTER_API_KEY.
// A test case names a model by its OpenRouter ID, e.g. "codex-0.166.0/openai/gpt-5.5".
// Models come and go: check https://openrouter.ai/models for the current IDs.
const OPENROUTER_PROVIDER =
  `-c model_provider=openrouter` +
  ` -c 'model_providers.openrouter={name="OpenRouter",base_url="https://openrouter.ai/api/v1",env_key="OPENROUTER_API_KEY",wire_api="responses"}'`;

export default declareHarness({
  version: "0.166.0",
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g @openai/codex@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      writeRunScript(`codex exec ${OPENROUTER_PROVIDER} --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),
  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what the run script wrote to /thunderjar/result.json:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),
  requiredEnv: ["OPENROUTER_API_KEY"],
});
