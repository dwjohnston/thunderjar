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

/** A comment on where to find the agent's model IDs, which a test case names after the folder. */
const modelIds = (folder: string, where: string, examples: string[]) =>
  `// A test case names a model by the ID the agent takes, e.g. ${examples.map((id) => `"${folder}/${id}"`).join(", ")}.
// Models come and go: check ${where} for the current IDs.`;

const claudeCode = `import { claudeCode } from "thunderjar";

// Claude Code. Its fragment installs Claude Code as root, writes the model ID and the run script,
// /thunderjar/thunderjar-run.sh, then switches to the image's non-root \`node\` user: Claude Code
// won't skip its permission prompts as root, and nobody is there to answer them. It needs
// CLAUDE_CODE_OAUTH_TOKEN, a subscription token from \`claude setup-token\`, or ANTHROPIC_API_KEY:
// the token if both are set.
${modelIds(STARTER_FOLDERS.claudeCode, "https://docs.claude.com/en/docs/about-claude/models", ["claude-haiku-5-5", "claude-sonnet-5-5"])}
export default claudeCode({ version: "2.1.311" });
`;

const copilot = `import { copilot } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
${modelIds(STARTER_FOLDERS.copilot, "`copilot --help`, or GitHub's supported models page,", ["claude-haiku-5.5", "gpt-5.5"])}
// Which you can use depends on your Copilot plan and your organization's policy.
export default copilot({ version: "1.0.105" });
`;

const codex = `import { codex } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox. Its fragment
// installs Codex as root, writes the model ID and the run script, then switches to the image's
// non-root \`node\` user. It needs OPENAI_API_KEY.
${modelIds(STARTER_FOLDERS.codex, "https://developers.openai.com/codex/models", ["gpt-6.1-sol", "gpt-5.5"])}
export default codex({ version: "0.166.0" });
`;

const opencode = `import { opencode } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key. Its fragment installs
// OpenCode as root, installs its plugin package, writes the model ID and the run script, then
// switches to the image's non-root \`node\` user.
${modelIds(STARTER_FOLDERS.opencode, "https://opencode.ai/zen/v1/models", ["opencode/claude-haiku-5-5", "opencode/gpt-5.5"])}
export default opencode({ version: "1.19.5" });
`;

/** Each starter harness's `index.ts`, keyed by its folder under `harnessModels/`. */
export const STARTER_HARNESSES: Record<string, string> = {
  [STARTER_FOLDERS.claudeCode]: claudeCode,
  [STARTER_FOLDERS.copilot]: copilot,
  [STARTER_FOLDERS.codex]: codex,
  [STARTER_FOLDERS.opencode]: opencode,
};
