import { declareHarnessModels } from "thunderjar";

// Models come and go: check https://docs.claude.com/en/docs/about-claude/models for the current IDs.
export default declareHarnessModels({
  "haiku-4-5": "claude-haiku-4-5-20251001",
  "haiku-5-5": "claude-haiku-5-5",
  "sonnet-5-5": "claude-sonnet-5-5",
  "opus-5-5": "claude-opus-5-5",
});
