import { declareTestCase } from "thunderjar";

// example, on DeepSeek in place of Anthropic, through the claude-code-deepseek harness.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code-deepseek@2.1.283/deepseek-chat"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
