import { copilot } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
// Which models you can use depends on your Copilot plan and your organization's policy. A test
// case may name any model it declares, after the folder, e.g. "copilot-1.0.105/claude-haiku-5.5".
// To name others, pass `models`. To run it on OpenRouter, pass `provider: OPENROUTER` too.
export default copilot({ version: "1.0.105" });
