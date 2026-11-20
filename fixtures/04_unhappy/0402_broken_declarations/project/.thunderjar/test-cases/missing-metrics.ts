import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha/fake-model-small-001"],
  task: "missing-metrics",
  initialPrompt: ["plain"],
  iterations: 1,
});
