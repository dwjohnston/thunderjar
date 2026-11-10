import { declareInitialPrompt } from "thunderjar";

// A short timeout, so fake-sleeper is killed quickly.
export default declareInitialPrompt({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 2,
});
