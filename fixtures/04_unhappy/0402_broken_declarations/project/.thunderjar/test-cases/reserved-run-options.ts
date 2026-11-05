import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["reserved-options"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha/fake-model-small-001"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
