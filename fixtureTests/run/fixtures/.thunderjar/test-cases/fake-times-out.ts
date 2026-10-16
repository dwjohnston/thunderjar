import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-agent@1.0.2/fake"],
  task: "wait",
  initialPrompt: ["impatient"],
  iterations: 2,
});
