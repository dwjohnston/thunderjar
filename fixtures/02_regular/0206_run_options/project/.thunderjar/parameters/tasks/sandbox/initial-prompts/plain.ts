import { declareInitialPrompt, writePrompt } from "thunderjar";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("Sandbox yourself."),
  timeoutSeconds: 60,
});
