// The starter harnesses `init` scaffolds, one folder each under `harnessModels/`, named after the
// version it pins. Users copy and edit these rather than write a harness from scratch: to try
// another version, copy the folder. `compare-models` uses only Claude Code, so a new user can start
// with one key. `compare-harnesses` also uses Copilot and OpenCode.

/** The folder of each starter harness, by agent. */
export const STARTER_FOLDERS = {
  claudeCode: "claude-code-2.1.311",
  copilot: "copilot-1.0.105",
  codex: "codex-0.166.0",
  opencode: "opencode-1.19.5",
} as const;

const claudeCode = `import { claudeCode } from "thunderjar";

// Claude Code. Its fragment installs Claude Code as root, writes the model ID and the run script,
// /thunderjar/thunderjar-run.sh, then switches to the image's non-root \`node\` user: Claude Code
// won't skip its permission prompts as root, and nobody is there to answer them. It needs
// CLAUDE_CODE_OAUTH_TOKEN, a subscription token from \`claude setup-token\`, or ANTHROPIC_API_KEY:
// the token if both are set. A test case may name any of Anthropic's current models, after the
// folder, e.g. "claude-code-2.1.311/claude-haiku-5-5". To name others, pass \`models\`.
export default claudeCode({ version: "2.1.311" });
`;

const copilot = `import { copilot } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
// Which models you can use depends on your Copilot plan and your organization's policy. A test
// case may name any model it declares, after the folder, e.g. "copilot-1.0.105/claude-haiku-5.5".
// To name others, pass \`models\`. To run it on OpenRouter, pass \`provider: OPENROUTER\` too.
export default copilot({ version: "1.0.105" });
`;

const codex = `import { codex } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox. It needs
// OPENAI_API_KEY. A test case may name any of OpenAI's models it declares, with a reasoning
// effort, after the folder, e.g. "codex-0.166.0/gpt-5.5/medium". To name others, pass \`models\`.
// To run it on OpenRouter, pass \`provider: OPENROUTER\` too, with OpenRouter's model IDs.
export default codex({ version: "0.166.0" });
`;

const opencode = `import { opencode } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key. A test case may name any
// model it declares, provider first, after the folder, e.g. "opencode-1.19.5/opencode/claude-haiku-5-5".
// To name others, pass \`models\`. To run it on OpenRouter, pass \`provider: OPENROUTER\` too.
export default opencode({ version: "1.19.5" });
`;

/** Each starter harness's `index.ts`, keyed by its folder under `harnessModels/`. */
export const STARTER_HARNESSES: Record<string, string> = {
  [STARTER_FOLDERS.claudeCode]: claudeCode,
  [STARTER_FOLDERS.copilot]: copilot,
  [STARTER_FOLDERS.codex]: codex,
  [STARTER_FOLDERS.opencode]: opencode,
};
