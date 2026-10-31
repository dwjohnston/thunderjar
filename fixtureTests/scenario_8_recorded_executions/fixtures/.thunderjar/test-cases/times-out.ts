import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@1.0.2/fake-model-small"],
  task: "wait",
  initialPrompt: ["impatient"],
  iterations: 2,
});
