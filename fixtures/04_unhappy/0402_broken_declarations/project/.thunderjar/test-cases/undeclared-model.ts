import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-efforts/fake/model-medium"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
