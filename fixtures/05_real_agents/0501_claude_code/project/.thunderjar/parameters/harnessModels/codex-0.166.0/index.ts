import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox.
// A test case names a model by the ID the agent takes, e.g. "codex-0.166.0/gpt-6.1-sol", "codex-0.166.0/gpt-5.5".
// Models come and go: check https://developers.openai.com/codex/models for the current IDs.
export default declareHarness({
  version: "0.166.0",
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g @openai/codex@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      writeRunScript(`codex exec --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),
  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what the run script wrote to /thunderjar/result.json:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),
  requiredEnv: ["OPENAI_API_KEY"],
});
