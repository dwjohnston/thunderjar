import { declareTestCase } from "thunderjar-published";

// The same model in three harnesses: Haiku 5.5 in Claude Code, GitHub Copilot CLI and OpenCode.
// Claude Code needs ANTHROPIC_API_KEY. Copilot and OpenCode both use OpenRouter, with OPENROUTER_API_KEY.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-start"],
  promptSet: ["none"],
  harnessModel: [
    "claude-code-2.1.311/claude-haiku-5-5",
    "copilot-1.0.105/anthropic/claude-haiku-5.5",
    "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5",
  ],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
