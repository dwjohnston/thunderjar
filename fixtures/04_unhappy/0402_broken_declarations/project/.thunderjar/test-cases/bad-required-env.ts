import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-bad-env/fake-model-small-001"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
