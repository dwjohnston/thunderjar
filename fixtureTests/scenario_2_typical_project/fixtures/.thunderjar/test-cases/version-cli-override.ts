import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@1.1.0/fake-model-large"],
  task: "is-prime",
  initialPrompt: ["terse"],
  iterations: 1,
});
