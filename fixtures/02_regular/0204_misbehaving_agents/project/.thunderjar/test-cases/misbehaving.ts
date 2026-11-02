import { declareTestCase } from "thunderjar";

// One container run of each misbehaving fake agent.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-sleeper@1.0.0/fake-model-small", "fake-crasher@1.0.0/fake-model-small", "fake-silent@1.0.0/fake-model-small"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
