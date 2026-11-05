import { declareHarness } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN npm install -g @openai/codex@${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first resumes the session.
  cli: (ctx) =>
    `codex exec${ctx.turn === 0 ? "" : " resume --last"} --model ${ctx.modelId} --json --dangerously-bypass-approvals-and-sandbox` +
    ` "$(cat ${ctx.promptPath})" > ${ctx.resultPath}`,
  // Thunderjar has no reader for this agent's reply yet. To measure it, return the agent's final
  // reply from what `cli` wrote to its result path:
  // collectReply: (raw) => …,
  requiredEnv: ["OPENAI_API_KEY"],
});
