import { declareHarnessModels } from "thunderjar";

// Models come and go: check https://developers.openai.com/codex/models for the current IDs.
export default declareHarnessModels({
  "gpt-6-1-sol": "gpt-6.1-sol",
  "gpt-6-astra": "gpt-6-astra",
  "gpt-6-luna": "gpt-6-luna",
  "gpt-5-6-luna": "gpt-5.6-luna",
  "gpt-5-5": "gpt-5.5",
});
