import { declareBaseImage } from "thunderjar";

// node20, with Claude Code pointed at DeepSeek's Anthropic-compatible API, for its background
// requests as well as its main one, and kept from calling anywhere else.
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm
ENV ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \\
    ANTHROPIC_SMALL_FAST_MODEL=deepseek-chat \\
    ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat \\
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
});
