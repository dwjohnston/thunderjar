import { declareHarness } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN npm install -g @github/copilot@${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first continues the session.
  cli: (ctx) =>
    `copilot -p "$(cat ${ctx.promptPath})" --model ${ctx.modelId} --allow-all-tools --no-color` +
    `${ctx.turn === 0 ? "" : " --continue"} > ${ctx.resultPath}`,
  // Thunderjar has no reader for this agent's reply yet. To measure it, return the agent's final
  // reply from what `cli` wrote to its result path:
  // collectReply: (raw) => …,
  requiredEnv: ["COPILOT_GITHUB_TOKEN"],
});
