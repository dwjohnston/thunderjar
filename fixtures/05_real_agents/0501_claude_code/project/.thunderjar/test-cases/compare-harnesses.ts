import { declareTestCase } from "thunderjar";

// The same model in three harnesses: Haiku 5.5 in Claude Code, GitHub Copilot CLI and OpenCode.
// Each harness needs its own key: ANTHROPIC_API_KEY, COPILOT_GITHUB_TOKEN and OPENCODE_API_KEY.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: [
    "claude-code-2.1.311/claude-haiku-5-5",
    "copilot-1.0.105/claude-haiku-5.5",
    "opencode-1.19.5/opencode/claude-haiku-5-5",
  ],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
