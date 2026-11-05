import { declareHarnessModels } from "thunderjar";

// Models come and go: check `copilot --help`, or GitHub's supported models page, for the current IDs.
// Which you can use depends on your Copilot plan and your organization's policy.
export default declareHarnessModels({
  "gpt-6-1-sol": "gpt-6.1-sol",
  "gpt-5-6-luna": "gpt-5.6-luna",
  "gpt-5-5": "gpt-5.5",
  "haiku-5-5": "claude-haiku-5.5",
  "sonnet-5-5": "claude-sonnet-5.5",
  "opus-5-5": "claude-opus-5.5",
});
