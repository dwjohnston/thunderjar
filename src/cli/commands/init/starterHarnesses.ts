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

/** Installs `install` as root, then runs the agent as the image's non-root `node` user. */
const installAsRoot = (install: string) => `\`RUN ${install}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node\``;

/** Comments on `collectReply` and `collectTokenCosts`, for an agent the library has no reader for yet. */
const stubReaders = `  // Thunderjar has no reader for this agent's output yet. To measure its reply, and its token
  // costs, read them from what \`cli\` wrote to its result path:
  // collectReply: (raw) => …,
  // collectTokenCosts: (raw, ctx) => ({ outcome: "collected", models: [{ model: ctx.modelId, … }] }),`;

/** A comment on where to find the agent's model IDs, which a test case names after the folder. */
const modelIds = (folder: string, where: string, examples: string[]) =>
  `// A test case names a model by the ID the agent takes, e.g. ${examples.map((id) => `"${folder}/${id}"`).join(", ")}.
// Models come and go: check ${where} for the current IDs.`;

const claudeCode = `import { claudeCode } from "thunderjar";

// Claude Code, installed as root, then run as the image's non-root \`node\` user: it won't skip its
// permission prompts as root, and nobody is there to answer them. It needs ANTHROPIC_API_KEY.
${modelIds(STARTER_FOLDERS.claudeCode, "https://docs.claude.com/en/docs/about-claude/models", ["claude-haiku-5-5", "claude-sonnet-5-5"])}
export default claudeCode({ version: "2.1.311" });
`;

const copilot = `import { declareHarness } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
${modelIds(STARTER_FOLDERS.copilot, "`copilot --help`, or GitHub's supported models page,", ["claude-haiku-5.5", "gpt-5.5"])}
// Which you can use depends on your Copilot plan and your organization's policy.
export default declareHarness({
  version: "1.0.105",
  applyParameter: (_config, ctx) => ${installAsRoot("npm install -g @github/copilot@${ctx.version}")},
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first continues the session.
  cli: (ctx) =>
    \`copilot -p "$(cat \${ctx.promptPath})" --model \${ctx.modelId} --allow-all-tools --no-color\` +
    \`\${ctx.turn === 0 ? "" : " --continue"} > \${ctx.resultPath}\`,
${stubReaders}
  requiredEnv: ["COPILOT_GITHUB_TOKEN"],
});
`;

const codex = `import { declareHarness } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox.
${modelIds(STARTER_FOLDERS.codex, "https://developers.openai.com/codex/models", ["gpt-6.1-sol", "gpt-5.5"])}
export default declareHarness({
  version: "0.166.0",
  applyParameter: (_config, ctx) => ${installAsRoot("npm install -g @openai/codex@${ctx.version}")},
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first resumes the session.
  cli: (ctx) =>
    \`codex exec\${ctx.turn === 0 ? "" : " resume --last"} --model \${ctx.modelId} --json --dangerously-bypass-approvals-and-sandbox\` +
    \` "$(cat \${ctx.promptPath})" > \${ctx.resultPath}\`,
${stubReaders}
  requiredEnv: ["OPENAI_API_KEY"],
});
`;

const opencode = `import { declareHarness } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key.
${modelIds(STARTER_FOLDERS.opencode, "https://opencode.ai/zen/v1/models", ["opencode/claude-haiku-5-5", "opencode/gpt-5.5"])}
export default declareHarness({
  version: "1.19.5",
  applyParameter: (_config, ctx) => ${installAsRoot("npm install -g opencode-ai@${ctx.version}")},
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first continues the session.
  cli: (ctx) =>
    \`opencode run --model \${ctx.modelId} --format json\${ctx.turn === 0 ? "" : " --continue"}\` +
    \` "$(cat \${ctx.promptPath})" > \${ctx.resultPath}\`,
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
