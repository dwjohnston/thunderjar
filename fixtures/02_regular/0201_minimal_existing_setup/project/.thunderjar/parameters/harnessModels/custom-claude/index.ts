import { OPENROUTER, claudeCode } from "thunderjar";

// Claude Code through OpenRouter, which speaks Anthropic's Messages API. It needs only
// OPENROUTER_API_KEY, and names its models by OpenRouter's IDs, e.g.
// "custom-claude/anthropic/claude-opus-5.5/high".
export default claudeCode({
  version: "2.1.311",
  provider: OPENROUTER,
  models: {
    "anthropic/claude-opus-5.5": [{ effort: { values: ["low", "high"] } }],
    "anthropic/claude-sonnet-5.5": [],
  },
});
