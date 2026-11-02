import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-rememberer@1.0.0/fake-model-small"],
  task: "rubber-ducky",
  initialPrompt: ["tell-then-ask"],
  iterations: 1,
});
