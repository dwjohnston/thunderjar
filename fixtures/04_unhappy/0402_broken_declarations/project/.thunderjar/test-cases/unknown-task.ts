import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
  task: "is-even",
  initialPrompt: ["plain"],
  iterations: 1,
});
