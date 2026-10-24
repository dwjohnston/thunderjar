import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node-lts"],
  codeState: ["baseline"],
  promptSet: ["glurk", "glurk-reworded"],
  harnessModel: ["fake-harness-beta@1.0.0/fake-model-large"],
  task: "is-prime",
  initialPrompt: ["terse"],
  iterations: 1,
});
