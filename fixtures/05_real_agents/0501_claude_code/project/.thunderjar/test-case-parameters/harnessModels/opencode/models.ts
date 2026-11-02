import { declareHarnessModels } from "thunderjar";

// Models come and go: check https://opencode.ai/zen/v1/models for the current IDs.
export default declareHarnessModels({
  "opus-5": "opencode/claude-opus-5",
  "gpt-5-6-luna": "opencode/gpt-5.6-luna",
  "gpt-5-5": "opencode/gpt-5.5",
  "deepseek-v4-pro": "opencode/deepseek-v4-pro",
});
