import { declareTestCase } from "thunderjar";

// One container run of each misbehaving fake agent.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-sleeper/fake-model-small-001", "fake-crasher/fake-model-small-001", "fake-silent/fake-model-small-001"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
