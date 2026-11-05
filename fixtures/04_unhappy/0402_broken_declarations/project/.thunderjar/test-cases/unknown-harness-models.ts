import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-gamma/fake-model-small-001", "fake-harness-alpha@1.0.0/fake-model-small", "fake-harness-alpha"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
