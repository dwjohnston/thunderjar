import { declareInitialPrompt, writePrompt } from "thunderjar";

// Writes the prompt to /thunderjar/prompt.txt, for the harness's run script to pass to the agent.
export default declareInitialPrompt({
  applyParameter: () => writePrompt("Create a file isPrime.ts exporting a function that tests for primality."),
  timeoutSeconds: 600,
});
