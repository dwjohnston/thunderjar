import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.2.0/sonnet-5-5"],
  task: "is-prime",
  initialPrompt: ["terse"],
  iterations: 1,
});
