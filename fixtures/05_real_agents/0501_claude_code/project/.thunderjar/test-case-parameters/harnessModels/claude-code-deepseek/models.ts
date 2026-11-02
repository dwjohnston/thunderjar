import { declareHarnessModels } from "thunderjar";

// Models come and go: check https://api-docs.deepseek.com/quick_start/pricing for the current IDs.
export default declareHarnessModels({
  "deepseek-chat": "deepseek-chat",
  "deepseek-reasoner": "deepseek-reasoner",
});
