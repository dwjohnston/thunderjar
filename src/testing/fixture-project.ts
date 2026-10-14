// A throwaway `.thunderjar/` project for tests, matching the example in
// spec/055-declaring-test-cases.md and spec/100-cli-reference.md#plan: one base image,
// one code state, two prompt sets, two harness/model pairs across two families, one
// task with two initial prompts.

import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..", "..");

const stub = (fn: string, body: string) => `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

const FILES: Record<string, string> = {
  "test-case-parameters/baseImages/node20/index.ts": stub("declareBaseImage", `{
  applyParameter: () => \`FROM node:20-bookworm\`,
}`),
  "test-case-parameters/codeStates/baseline/index.ts": stub("declareCodeState", `{
  commit: "a1b2c3",
  applyParameter: () => \`RUN npm ci\`,
}`),
  "test-case-parameters/promptSets/snerk/index.ts": stub("declarePromptSet", `{
  commit: "e4f5a6",
  files: { "prompts/snerk.md": "CLAUDE.md" },
  applyParameter: () => \`\`,
}`),
  "test-case-parameters/promptSets/glurk/index.ts": stub("declarePromptSet", `{
  commit: "e4f5a6",
  files: { "prompts/glurk.md": "CLAUDE.md" },
  applyParameter: () => \`\`,
}`),
  "test-case-parameters/harnessModels/claude-code/index.ts": stub("declareHarness", `{
  applyParameter: (ctx) => \`RUN npm install -g @anthropic-ai/claude-code@\${ctx.version}\`,
  cli: (ctx) => \`claude -p "\${ctx.initialPrompt}" --model \${ctx.modelId} > \${ctx.resultPath}\`,
  requiredEnv: ["ANTHROPIC_API_KEY"],
}`),
  "test-case-parameters/harnessModels/claude-code/models.ts": stub("declareHarnessModels", `{
  "haiku-4-5": "claude-haiku-4-5-20251001",
  "sonnet-5-5": "claude-sonnet-5-5",
}`),
  "test-case-parameters/harnessModels/claude-code/versions.ts": stub("declareHarnessVersions", `{
  "2.1.283": { version: "2.1.283" },
  "2.2.0": { version: "2.2.0" },
}`),
  "test-case-parameters/harnessModels/claude-code/collectTokenCosts.ts": stub("declareTokenCostCollector", `
  (raw, ctx) => ({ outcome: "unavailable", reason: "notReported" }),
`),
  "test-case-parameters/harnessModels/codex/index.ts": stub("declareHarness", `{
  applyParameter: (ctx) => \`RUN npm install -g @openai/codex@\${ctx.version}\`,
  cli: (ctx) => \`codex exec "\${ctx.initialPrompt}" --model \${ctx.modelId} > \${ctx.resultPath}\`,
  requiredEnv: ["OPENAI_API_KEY"],
}`),
  "test-case-parameters/harnessModels/codex/models.ts": stub("declareHarnessModels", `{
  "gpt-luna": "gpt-luna",
}`),
  "test-case-parameters/harnessModels/codex/versions.ts": stub("declareHarnessVersions", `{
  "0.9.0": { version: "0.9.0" },
}`),
  "test-case-parameters/harnessModels/codex/collectTokenCosts.ts": stub("declareTokenCostCollector", `
  (raw, ctx) => ({ outcome: "unavailable", reason: "notReported" }),
`),
  "test-case-parameters/tasks/is-prime/initial-prompts/plain.ts": stub("declareInitialPrompt", `{
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 600,
  applyParameter: () => \`\`,
}`),
  "test-case-parameters/tasks/is-prime/initial-prompts/terse.ts": stub("declareInitialPrompt", `{
  prompt: "isPrime.ts: export a primality test.",
  timeoutSeconds: 600,
  applyParameter: () => \`\`,
}`),
  "test-cases/is-prime-baseline.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5", "codex@0.9.0/gpt-luna"],
  task: "is-prime",
  initialPrompt: ["plain", "terse"],
  iterations: 5,
}`),
};

/** Writes the fixture project's `.thunderjar/` folder into `dir`. */
export async function createFixtureProject(dir: string): Promise<void> {
  const root = join(dir, ".thunderjar");
  for (const [rel, content] of Object.entries(FILES)) {
    const path = join(root, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
}

/** Makes `thunderjar` resolvable from `dir`, the same way `bun link` would. */
export async function linkThunderjar(dir: string): Promise<void> {
  await mkdir(join(dir, "node_modules"), { recursive: true });
  await symlink(repoRoot, join(dir, "node_modules", "thunderjar"), "dir");
}
