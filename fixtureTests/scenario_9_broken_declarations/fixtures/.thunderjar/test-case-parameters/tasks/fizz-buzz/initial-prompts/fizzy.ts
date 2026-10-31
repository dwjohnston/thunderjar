import { declareInitialPrompt } from "thunderjar";

export default declareInitialPrompt({
  prompt: "FizzBuzz.",
  timeoutSeconds: 600,
  applyParameter: () => ``,
});
