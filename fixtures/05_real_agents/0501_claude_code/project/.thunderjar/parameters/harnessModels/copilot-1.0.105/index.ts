import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
// A test case names a model by the ID the agent takes, e.g. "copilot-1.0.105/claude-haiku-5.5", "copilot-1.0.105/gpt-5.5".
// Models come and go: check `copilot --help`, or GitHub's supported models page, for the current IDs.
// Which you can use depends on your Copilot plan and your organization's policy.
export default declareHarness({
  version: "1.0.105",
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g @github/copilot@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      writeRunScript(`copilot -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --allow-all-tools --no-color > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),
  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what the run script wrote to /thunderjar/result.json:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),
  requiredEnv: ["COPILOT_GITHUB_TOKEN"],
});
