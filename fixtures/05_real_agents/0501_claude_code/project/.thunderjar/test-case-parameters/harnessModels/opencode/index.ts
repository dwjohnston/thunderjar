import { declareHarness } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN npm install -g opencode-ai@${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first continues the session.
  cli: (ctx) =>
    `opencode run --model ${ctx.modelId} --format json${ctx.turn === 0 ? "" : " --continue"}` +
    ` "$(cat ${ctx.promptPath})" > ${ctx.resultPath}`,
  // Thunderjar has no reader for this agent's reply yet. To measure it, return the agent's final
  // reply from what `cli` wrote to its result path:
  // collectReply: (raw) => …,
  requiredEnv: ["OPENCODE_API_KEY"],
});
