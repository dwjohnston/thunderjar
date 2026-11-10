import { declareInitialPrompt } from "thunderjar";

// Both a prompt and turns: which should run?
export default declareInitialPrompt({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  turns: ["Create a file isPrime.ts.", "Now export a primality test from it."],
  timeoutSeconds: 600,
});
