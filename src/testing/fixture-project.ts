// A throwaway `.thunderjar/` project for tests, matching the example in
// spec/055-declaring-test-cases.md and spec/100-cli-reference.md#plan: one base image,
// one code state, two prompt sets, two harness/model pairs across two families, one
// task with two initial prompts and four measurements.

import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..", "..");

export const stub = (fn: string, body: string) => `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

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
  files: { "prompts/snerk.md": "FAKE_INSTRUCTIONS.md" },
  applyParameter: () => \`\`,
}`),
  "test-case-parameters/promptSets/glurk/index.ts": stub("declarePromptSet", `{
  commit: "e4f5a6",
  files: { "prompts/glurk.md": "FAKE_INSTRUCTIONS.md" },
  applyParameter: () => \`\`,
}`),
  // The fake agents (spec/120-test-boundaries.md#32-generating-the-post-run-image): ordinary
  // harness families whose cli writes a known isPrime.ts into the workspace, with the prompt as
  // a comment, and a result file. fake-harness-alpha's has a @ts-ignore and a bug (2 isn't
  // prime, 15 is); fake-harness-beta's is correct. The same as fixtureTests/scenario_2.
  "test-case-parameters/harnessModels/fake-harness-alpha/index.ts": stub("declareHarness", `{
  applyParameter: (ctx) => \`RUN echo "install fake-harness-alpha@\${ctx.version}"\`,
  cli: (ctx) =>
    \`printf '%s\\\\n' '// \${ctx.initialPrompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts\` +
    \` && echo '{"model":"\${ctx.modelId}"}' > \${ctx.resultPath}\`,
}`),
  "test-case-parameters/harnessModels/fake-harness-alpha/models.ts": stub("declareHarnessModels", `{
  "fake-model-small": "fake-model-small-001",
  "fake-model-large": "fake-model-large-001",
}`),
  "test-case-parameters/harnessModels/fake-harness-alpha/versions.ts": stub("declareHarnessVersions", `{
  "1.0.0": { version: "1.0.0" },
  "1.1.0": { version: "1.1.0" },
}`),
  "test-case-parameters/harnessModels/fake-harness-alpha/collectTokenCosts.ts": stub("declareTokenCostCollector", `
  (_raw, _ctx) => ({ outcome: "unavailable", reason: "notReported" }),
`),
  "test-case-parameters/harnessModels/fake-harness-beta/index.ts": stub("declareHarness", `{
  applyParameter: (ctx) => \`RUN echo "install fake-harness-beta@\${ctx.version}"\`,
  cli: (ctx) =>
    \`printf '%s\\\\n' '// \${ctx.initialPrompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts\` +
    \` && echo '{"model":"\${ctx.modelId}"}' > \${ctx.resultPath}\`,
}`),
  "test-case-parameters/harnessModels/fake-harness-beta/models.ts": stub("declareHarnessModels", `{
  "fake-model-large": "fake-model-large-001",
}`),
  "test-case-parameters/harnessModels/fake-harness-beta/versions.ts": stub("declareHarnessVersions", `{
  "1.0.0": { version: "1.0.0" },
}`),
  "test-case-parameters/harnessModels/fake-harness-beta/collectTokenCosts.ts": stub("declareTokenCostCollector", `
  (_raw, _ctx) => ({ outcome: "unavailable", reason: "notReported" }),
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
  // One file the fake agent leaves and one it doesn't, its @ts-ignores, and a test its bug fails.
  "test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts": stub("declareMeasurement", `{
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
}`),
  "test-case-parameters/tasks/is-prime/measurements/readmeExists.ts": stub("declareMeasurement", `{
  instrument: "fileCreated",
  config: { glob: "**/README.md" },
  aggregate: ["rate"],
}`),
  "test-case-parameters/tasks/is-prime/measurements/tsIgnoreCount.ts": stub("declareMeasurement", `{
  instrument: "grep",
  config: { glob: "**/*.ts", pattern: "@ts-ignore" },
  aggregate: ["mean", "max"],
}`),
  "test-case-parameters/tasks/is-prime/measurements/isPrimeTemplateTest.ts": stub("declareMeasurement", `{
  instrument: "templateTest",
  config: { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" },
  aggregate: ["sum"],
}`),
  "test-case-parameters/tasks/is-prime/measurements/isPrime.test.template.ts": `import { {{defaultExport}} } from "{{subjectPath}}";

test("2 is prime", () => expect({{defaultExport}}(2)).toBe(true));
test("17 is prime", () => expect({{defaultExport}}(17)).toBe(true));
test("15 is not prime", () => expect({{defaultExport}}(15)).toBe(false));
test("0 is not prime", () => expect({{defaultExport}}(0)).toBe(false));
test("1 is not prime", () => expect({{defaultExport}}(1)).toBe(false));
`,
  "test-cases/is-prime-baseline.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small", "fake-harness-beta@1.0.0/fake-model-large"],
  task: "is-prime",
  initialPrompt: ["plain", "terse"],
  iterations: 5,
}`),
  "test-cases/fake-is-prime.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 2,
}`),
};

/**
 * Writes the fixture project's `.thunderjar/` folder into `dir`. `changes` replaces or adds
 * files by their path under `.thunderjar/`; null leaves a file out.
 */
export async function createFixtureProject(dir: string, changes: Record<string, string | null> = {}): Promise<void> {
  const root = join(dir, ".thunderjar");
  for (const [rel, content] of Object.entries({ ...FILES, ...changes })) {
    if (content === null) continue;
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
