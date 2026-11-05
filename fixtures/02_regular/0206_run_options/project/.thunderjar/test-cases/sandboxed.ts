import { declareTestCase } from "thunderjar";

// The sandboxing agent, in containers with and without the run options it needs.
export default declareTestCase({
  baseImage: ["node20", "node20-unconfined"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-sandboxer/fake-model-small-001"],
  task: "sandbox",
  initialPrompt: ["plain"],
  iterations: 1,
});
