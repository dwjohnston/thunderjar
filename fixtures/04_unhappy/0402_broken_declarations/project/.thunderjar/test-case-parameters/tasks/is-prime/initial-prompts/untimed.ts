import { declareInitialPrompt } from "thunderjar";

// A timeout no agent could run within.
export default declareInitialPrompt({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 0,
});
