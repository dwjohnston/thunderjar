import { declareInitialPrompt } from "thunderjar";

// A task without measurements, and a timeout short enough to hit.
export default declareInitialPrompt({
  prompt: "Take your time.",
  timeoutSeconds: 1,
  applyParameter: () => ``,
});
