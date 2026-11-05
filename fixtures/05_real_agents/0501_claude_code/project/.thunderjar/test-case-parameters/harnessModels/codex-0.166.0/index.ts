import { declareHarness } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox.
// A test case names a model by the ID the agent takes, e.g. "codex-0.166.0/gpt-6.1-sol", "codex-0.166.0/gpt-5.5".
// Models come and go: check https://developers.openai.com/codex/models for the current IDs.
export default declareHarness({
  version: "0.166.0",
  applyParameter: (_config, ctx) => `RUN npm install -g @openai/codex@${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first resumes the session.
  cli: (ctx) =>
    `codex exec${ctx.turn === 0 ? "" : " resume --last"} --model ${ctx.modelId} --json --dangerously-bypass-approvals-and-sandbox` +
    ` "$(cat ${ctx.promptPath})" > ${ctx.resultPath}`,
  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what `cli` wrote to its result path:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),
  requiredEnv: ["OPENAI_API_KEY"],
});
