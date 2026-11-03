// The starter harnesses `init` scaffolds, one folder each under `harnessModels/`. Users copy and
// edit these rather than write a harness from scratch. Only `claude-code` is in the example test
// case, so a new user needs only one key.

const declaration = (fn: string, body: string) =>
  `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

/** A `models.ts`: each model's name, as a test case uses it, to the ID the agent is given. */
const models = (comment: string, entries: [string, string][]) =>
  `import { declareHarnessModels } from "thunderjar";

${comment}
export default declareHarnessModels({
${entries.map(([name, id]) => `  ${JSON.stringify(name)}: ${JSON.stringify(id)},`).join("\n")}
});
`;

const versions = (version: string) =>
  declaration(
    "declareHarnessVersions",
    `{
  ${JSON.stringify(version)}: { version: ${JSON.stringify(version)} },
}`,
  );

// Claude Code's `--output-format json` result, read by the library's own reader.
const claudeCodeTokenCosts = `import { claudeCodeTokenCosts, declareTokenCostCollector } from "thunderjar";

export default declareTokenCostCollector((raw) => claudeCodeTokenCosts(raw));
`;

/** For an agent the library has no reader for yet: no token costs, until it's filled in. */
const stubTokenCosts = (agent: string) => `import { declareTokenCostCollector } from "thunderjar";

// Thunderjar has no reader for ${agent}'s output yet. \`raw\` is what the harness's \`cli\` wrote to
// its result path. To collect token costs, read them from it:
//
//   return {
//     outcome: "collected",
//     models: [{ model: ctx.modelId, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }],
//   };
export default declareTokenCostCollector((_raw, _ctx) => ({ outcome: "unavailable", reason: "notReported" }));
`;

/** Installs `install` as root, then runs the agent as the image's non-root `node` user. */
const installAsRoot = (install: string) => `\`RUN ${install}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node\``;

/** Comments on `collectReply`, for an agent the library has no reader for yet. */
const stubReply = `  // Thunderjar has no reader for this agent's reply yet. To measure it, return the agent's final
  // reply from what \`cli\` wrote to its result path:
  // collectReply: (raw) => …,`;

const claudeCode = `import { claudeCodeReply, declareHarness } from "thunderjar";

// Claude Code, installed as root, then run as the image's non-root \`node\` user: it won't skip its
// permission prompts as root, and nobody is there to answer them.
export default declareHarness({
  applyParameter: (_config, ctx) => \`RUN npm install -g @anthropic-ai/claude-code@\${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node\`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Turn 0 starts
  // the session, and any later turn resumes it.
  cli: (ctx) =>
    \`claude -p "$(cat \${ctx.promptPath})" --model \${ctx.modelId} --output-format json --dangerously-skip-permissions\` +
    \` \${ctx.turn === 0 ? "--session-id" : "--resume"} \${ctx.sessionId} > \${ctx.resultPath}\`,
  collectReply: claudeCodeReply,
  requiredEnv: ["ANTHROPIC_API_KEY"],
});
`;

const copilot = `import { declareHarness } from "thunderjar";

// GitHub Copilot CLI. COPILOT_GITHUB_TOKEN is a GitHub token with Copilot access: a fine-grained
// personal access token with the "Copilot Requests" permission.
export default declareHarness({
  applyParameter: (_config, ctx) => ${installAsRoot("npm install -g @github/copilot@${ctx.version}")},
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first continues the session.
  cli: (ctx) =>
    \`copilot -p "$(cat \${ctx.promptPath})" --model \${ctx.modelId} --allow-all-tools --no-color\` +
    \`\${ctx.turn === 0 ? "" : " --continue"} > \${ctx.resultPath}\`,
${stubReply}
  requiredEnv: ["COPILOT_GITHUB_TOKEN"],
});
`;

const codex = `import { declareHarness } from "thunderjar";

// OpenAI's Codex CLI, without its sandbox or approvals: the container is the sandbox.
export default declareHarness({
  applyParameter: (_config, ctx) => ${installAsRoot("npm install -g @openai/codex@${ctx.version}")},
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first resumes the session.
  cli: (ctx) =>
    \`codex exec\${ctx.turn === 0 ? "" : " resume --last"} --model \${ctx.modelId} --json --dangerously-bypass-approvals-and-sandbox\` +
    \` "$(cat \${ctx.promptPath})" > \${ctx.resultPath}\`,
${stubReply}
  requiredEnv: ["OPENAI_API_KEY"],
});
`;

const opencode = `import { declareHarness } from "thunderjar";

// OpenCode, on OpenCode Zen. OPENCODE_API_KEY is an OpenCode Zen key.
export default declareHarness({
  applyParameter: (_config, ctx) => ${installAsRoot("npm install -g opencode-ai@${ctx.version}")},
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Any turn after
  // the first continues the session.
  cli: (ctx) =>
    \`opencode run --model \${ctx.modelId} --format json\${ctx.turn === 0 ? "" : " --continue"}\` +
    \` "$(cat \${ctx.promptPath})" > \${ctx.resultPath}\`,
${stubReply}
  requiredEnv: ["OPENCODE_API_KEY"],
});
`;

const CHECK = (where: string) => `// Models come and go: check ${where} for the current IDs.`;

/** Each starter harness's files, keyed by its folder under `harnessModels/`, then by file name. */
export const STARTER_HARNESSES: Record<string, Record<string, string>> = {
  "claude-code": {
    "index.ts": claudeCode,
    "models.ts": models(CHECK("https://docs.claude.com/en/docs/about-claude/models"), [
      ["haiku-4-5", "claude-haiku-4-5-20251001"],
      ["haiku-5-5", "claude-haiku-5-5"],
      ["sonnet-5-5", "claude-sonnet-5-5"],
      ["opus-5-5", "claude-opus-5-5"],
    ]),
    "versions.ts": versions("2.1.283"),
    "collectTokenCosts.ts": claudeCodeTokenCosts,
  },
  copilot: {
    "index.ts": copilot,
    "models.ts": models(
      `${CHECK("`copilot --help`, or GitHub's supported models page,")}\n// Which you can use depends on your Copilot plan and your organization's policy.`,
      [
        ["gpt-6-1-sol", "gpt-6.1-sol"],
        ["gpt-5-6-luna", "gpt-5.6-luna"],
        ["gpt-5-5", "gpt-5.5"],
        ["haiku-5-5", "claude-haiku-5.5"],
        ["sonnet-5-5", "claude-sonnet-5.5"],
        ["opus-5-5", "claude-opus-5.5"],
      ],
    ),
    "versions.ts": versions("1.0.105"),
    "collectTokenCosts.ts": stubTokenCosts("Copilot CLI"),
  },
  codex: {
    "index.ts": codex,
    "models.ts": models(CHECK("https://developers.openai.com/codex/models"), [
      ["gpt-6-1-sol", "gpt-6.1-sol"],
      ["gpt-6-astra", "gpt-6-astra"],
      ["gpt-6-luna", "gpt-6-luna"],
      ["gpt-5-6-luna", "gpt-5.6-luna"],
      ["gpt-5-5", "gpt-5.5"],
    ]),
    "versions.ts": versions("0.166.0"),
    "collectTokenCosts.ts": stubTokenCosts("Codex"),
  },
  opencode: {
    "index.ts": opencode,
    "models.ts": models(CHECK("https://opencode.ai/zen/v1/models"), [
      ["opus-5", "opencode/claude-opus-5"],
      ["gpt-5-6-luna", "opencode/gpt-5.6-luna"],
      ["gpt-5-5", "opencode/gpt-5.5"],
      ["deepseek-v4-pro", "opencode/deepseek-v4-pro"],
    ]),
    "versions.ts": versions("1.19.5"),
    "collectTokenCosts.ts": stubTokenCosts("OpenCode"),
  },
};
