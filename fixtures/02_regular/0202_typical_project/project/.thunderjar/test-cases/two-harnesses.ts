import { declareTestCase } from "thunderjar";

// Few container runs, for running for real: one permutation per fake harness, one iteration each.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small", "fake-harness-beta@1.0.0/fake-model-large"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
