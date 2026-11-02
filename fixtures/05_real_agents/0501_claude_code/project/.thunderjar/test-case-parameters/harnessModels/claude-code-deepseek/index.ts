import { claudeCodeReply, declareHarness } from "thunderjar";

// The claude-code harness, on DeepSeek's Anthropic-compatible API. DEEPSEEK_API_KEY is passed to
// Claude Code as its auth token, and Claude Code's background requests go to DeepSeek too.
//
// Claude Code, installed as root, then run as the image's non-root `node` user: it won't skip its
// permission prompts as root, and nobody is there to answer them.
export default declareHarness({
  applyParameter: (_config, ctx) => `RUN npm install -g @anthropic-ai/claude-code@${ctx.version}
ENV ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \\
    ANTHROPIC_SMALL_FAST_MODEL=deepseek-chat \\
    ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat \\
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
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
