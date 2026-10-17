import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@9.9.9/fake-model-small", "fake-harness-alpha@1.0.0/fake-model-huge", "fake-harness-alpha-1.0.0"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
