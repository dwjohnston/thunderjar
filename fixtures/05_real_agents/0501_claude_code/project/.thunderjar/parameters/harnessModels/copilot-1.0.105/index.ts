import { declareHarness } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
// A test case names a model by the ID the agent takes, e.g. "copilot-1.0.105/claude-haiku-5.5", "copilot-1.0.105/gpt-5.5".
// Models come and go: check `copilot --help`, or GitHub's supported models page, for the current IDs.
// Which you can use depends on your Copilot plan and your organization's policy.
export default declareHarness({
  version: "1.0.105",
  applyParameter: (_config, ctx) => `RUN npm install -g @github/copilot@${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first continues the session.
  cli: (ctx) =>
    `copilot -p "$(cat ${ctx.promptPath})" --model ${ctx.modelId} --allow-all-tools --no-color` +
    `${ctx.turn === 0 ? "" : " --continue"} > ${ctx.resultPath}`,
  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what `cli` wrote to its result path:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),
  requiredEnv: ["COPILOT_GITHUB_TOKEN"],
});
