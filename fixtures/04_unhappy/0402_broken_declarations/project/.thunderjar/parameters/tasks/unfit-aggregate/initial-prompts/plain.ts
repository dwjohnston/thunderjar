import { declareInitialPrompt } from "thunderjar";

export default declareInitialPrompt({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 600,
});
