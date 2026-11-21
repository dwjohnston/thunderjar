import { declareTestCase } from "thunderjar";

// Claude Code on Haiku, Sonnet and Opus, adding the claude-code harness to the 0201 fixture.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-main"],
  promptSet: ["none"],
  harnessModel: [
    "claude-code-2.1.311/claude-haiku-5-5",
    "claude-code-2.1.311/claude-sonnet-5-5",
    "claude-code-2.1.311/claude-opus-5-5",
  ],
  task: "add-claude-code-harness-0201",
  initialPrompt: ["plain"],
  iterations: 1,
});
