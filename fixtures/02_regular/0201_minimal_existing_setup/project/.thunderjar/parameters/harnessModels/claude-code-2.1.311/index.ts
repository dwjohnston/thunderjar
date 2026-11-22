import { claudeCode } from "thunderjar";

// Claude Code. Its fragment installs Claude Code as root, writes the model ID and the run script,
// /thunderjar/thunderjar-run.sh, then switches to the image's non-root `node` user: Claude Code
// won't skip its permission prompts as root, and nobody is there to answer them. It needs
// CLAUDE_CODE_OAUTH_TOKEN, a subscription token from `claude setup-token`, or ANTHROPIC_API_KEY:
// the token if both are set. A test case may name any of Anthropic's current models, after the
// folder, e.g. "claude-code-2.1.311/claude-haiku-5-5". To name others, pass `models`.
export default claudeCode({ version: "2.1.311" });
