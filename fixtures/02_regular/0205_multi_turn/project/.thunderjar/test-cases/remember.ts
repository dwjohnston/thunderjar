import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-rememberer/fake-model-small-001"],
  task: "rubber-ducky",
  initialPrompt: ["tell-then-ask"],
  iterations: 1,
});
