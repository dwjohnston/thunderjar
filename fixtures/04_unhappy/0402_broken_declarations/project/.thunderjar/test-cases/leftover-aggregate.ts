import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha/fake-model-small-001"],
  task: "leftover-aggregate",
  initialPrompt: ["plain"],
  iterations: 1,
});
