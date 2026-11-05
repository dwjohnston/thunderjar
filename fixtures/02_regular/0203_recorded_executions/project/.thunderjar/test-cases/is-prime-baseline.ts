import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harnessModel: ["fake-harness-alpha/fake-model-small-001", "fake-harness-beta/fake-model-large-001"],
  task: "is-prime",
  initialPrompt: ["plain", "terse"],
  iterations: 5,
});
