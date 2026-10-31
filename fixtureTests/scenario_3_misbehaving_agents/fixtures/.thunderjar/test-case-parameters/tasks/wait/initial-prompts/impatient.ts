import { declareInitialPrompt } from "thunderjar";

// A timeout short enough to hit, on a task without measurements.
export default declareInitialPrompt({
  prompt: "Take your time.",
  timeoutSeconds: 1,
  applyParameter: () => ``,
});
