import { declareTestCase } from "thunderjar";

// A prompt full of shell syntax, for an agent that echoes it back.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-echo/fake-model-small-001"],
  task: "is-prime",
  initialPrompt: ["awkward"],
  iterations: 1,
});
