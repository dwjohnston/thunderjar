import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-agent@1.0.1/fake", "fake-agent@1.0.0/fake"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 2,
});
