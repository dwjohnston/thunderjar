import { declareTestCase } from "thunderjar";

// The same harness on two models: Claude Code on Haiku 4.5, and on Haiku 5.5.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5", "claude-code@2.1.283/haiku-5-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
