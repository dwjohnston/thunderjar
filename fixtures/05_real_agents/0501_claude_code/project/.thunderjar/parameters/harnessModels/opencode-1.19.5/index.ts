import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key.
export default declareHarness({
  version: "1.19.5",
  // The models a test case may name, after the folder. Models come and go: check
  // https://opencode.ai/zen/v1/models for the current IDs.
  models: {
    "opencode/claude-haiku-5-5": [],
    "opencode/gpt-5.5": [],
  },
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g opencode-ai@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      writeRunScript(`opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),
  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what the run script wrote to /thunderjar/result.json:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),
  requiredEnv: ["OPENCODE_API_KEY"],
});
