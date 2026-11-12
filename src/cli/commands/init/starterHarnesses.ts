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

/**
 * A harness's `applyParameter`, as source: installs the agent with `install` as root, writes the
 * model ID and a run script that runs `command`, then switches to the image's non-root `node` user.
 */
const applyParameter = (install: string, command: string) => `  applyParameter: (_config, ctx) =>
    [
      \`RUN ${install}\`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      // The prompt and model are read from their files, so quotes and newlines reach the agent intact.
      writeRunScript(\`${command}\`),
      "USER node",
    ].join("\\n"),`;

/** Comments on `collectReply` and `collectTokenCosts`, for an agent the library has no reader for yet. */
const stubReaders = `  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what the run script wrote to /thunderjar/result.json:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),`;

/** A comment on where to find the agent's model IDs, which a test case names after the folder. */
const modelIds = (folder: string, where: string, examples: string[]) =>
  `// A test case names a model by the ID the agent takes, e.g. ${examples.map((id) => `"${folder}/${id}"`).join(", ")}.
// Models come and go: check ${where} for the current IDs.`;

const IMPORTS = `import { declareHarness, writeModel, writeRunScript } from "thunderjar";`;

const claudeCode = `import { claudeCode } from "thunderjar";

// Claude Code. Its fragment installs Claude Code as root, writes the model ID and the run script,
// /thunderjar/thunderjar-run.sh, then switches to the image's non-root \`node\` user: Claude Code
// won't skip its permission prompts as root, and nobody is there to answer them. It needs ANTHROPIC_API_KEY.
${modelIds(STARTER_FOLDERS.claudeCode, "https://docs.claude.com/en/docs/about-claude/models", ["claude-haiku-5-5", "claude-sonnet-5-5"])}
export default claudeCode({ version: "2.1.311" });
`;

const copilot = `${IMPORTS}

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
${modelIds(STARTER_FOLDERS.copilot, "`copilot --help`, or GitHub's supported models page,", ["claude-haiku-5.5", "gpt-5.5"])}
// Which you can use depends on your Copilot plan and your organization's policy.
export default declareHarness({
  version: "1.0.105",
${applyParameter("npm install -g @github/copilot@${ctx.version}", 'copilot -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --allow-all-tools --no-color > /thunderjar/result.json')}
${stubReaders}
  requiredEnv: ["COPILOT_GITHUB_TOKEN"],
});
`;

const codex = `${IMPORTS}

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox.
${modelIds(STARTER_FOLDERS.codex, "https://developers.openai.com/codex/models", ["gpt-6.1-sol", "gpt-5.5"])}
export default declareHarness({
  version: "0.166.0",
${applyParameter("npm install -g @openai/codex@${ctx.version}", 'codex exec --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json')}
${stubReaders}
  requiredEnv: ["OPENAI_API_KEY"],
});
`;

const opencode = `${IMPORTS}

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key.
${modelIds(STARTER_FOLDERS.opencode, "https://opencode.ai/zen/v1/models", ["opencode/claude-haiku-5-5", "opencode/gpt-5.5"])}
export default declareHarness({
  version: "1.19.5",
${applyParameter("npm install -g opencode-ai@${ctx.version}", 'opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json')}
${stubReaders}
  requiredEnv: ["OPENCODE_API_KEY"],
});
`;

/** Each starter harness's `index.ts`, keyed by its folder under `harnessModels/`. */
export const STARTER_HARNESSES: Record<string, string> = {
  [STARTER_FOLDERS.claudeCode]: claudeCode,
  [STARTER_FOLDERS.copilot]: copilot,
  [STARTER_FOLDERS.codex]: codex,
  [STARTER_FOLDERS.opencode]: opencode,
};
