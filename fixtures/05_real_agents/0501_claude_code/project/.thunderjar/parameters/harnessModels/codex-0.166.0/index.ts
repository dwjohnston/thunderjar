import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox.
export default declareHarness({
  version: "0.166.0",
  // The models a test case may name, after the folder. Models come and go: check
  // https://developers.openai.com/codex/models for the current IDs.
  models: {
    "gpt-6.1-sol": [],
    "gpt-5.5": [],
  },
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
