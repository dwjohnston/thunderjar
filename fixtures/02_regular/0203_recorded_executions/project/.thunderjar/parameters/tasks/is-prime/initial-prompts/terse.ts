import { declareInitialPrompt, writePrompt } from "thunderjar";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("isPrime.ts: export a primality test."),
  timeoutSeconds: 600,
});
