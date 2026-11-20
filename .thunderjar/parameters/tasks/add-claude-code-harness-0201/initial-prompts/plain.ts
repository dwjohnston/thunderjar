import { declareInitialPrompt, writePrompt } from "thunderjar";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("Add the claude-code harness to the  0201 fixture"),
  timeoutSeconds: 900,
});
