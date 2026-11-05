import { claudeCodeReply, declareHarness } from "thunderjar";

// init's Claude Code harness, on DeepSeek's Anthropic-compatible API, which its base image
// points Claude Code at. DEEPSEEK_API_KEY is passed to Claude Code as its auth token.
//
// Claude Code, installed as root, then run as the image's non-root `node` user: it won't skip its
// permission prompts as root, and nobody is there to answer them.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN npm install -g @anthropic-ai/claude-code@${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Turn 0 starts
  // the session, and any later turn resumes it.
  cli: (ctx) =>
    `ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" claude -p "$(cat ${ctx.promptPath})" --model ${ctx.modelId} --output-format json --dangerously-skip-permissions` +
    ` ${ctx.turn === 0 ? "--session-id" : "--resume"} ${ctx.sessionId} > ${ctx.resultPath}`,
  collectReply: claudeCodeReply,
  requiredEnv: ["DEEPSEEK_API_KEY"],
});
