import { opencode } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key. A test case may name any
// model it declares, provider first, after the folder, e.g. "opencode-1.19.5/opencode/claude-haiku-5-5".
// To name others, pass `models`. To run it on OpenRouter, pass `provider: OPENROUTER` too.
export default opencode({ version: "1.19.5" });
