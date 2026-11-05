import { declareTestCase } from "thunderjar";

// The same harness on two models: Claude Code on Haiku 4.5, and on Haiku 5.5. Each pair is a
// harness folder, then the model ID its agent is given.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code-2.1.311/claude-haiku-4-5-20251001", "claude-code-2.1.311/claude-haiku-5-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
