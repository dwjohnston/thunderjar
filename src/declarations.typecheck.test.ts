// Confirms the mechanism described in
// spec/055-declaring-test-cases.md#typed-names actually works: a test case naming a
// parameter absent from the generated types is a compile error, and one naming only
// generated names compiles cleanly. Runs real `tsc` against a throwaway project, so
// each case gets its own process.

import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generate } from "./commands/generate.ts";
import { createFixtureProject, linkThunderjar } from "./testing/fixture-project.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-typecheck-"));
const tsc = resolve(import.meta.dir, "..", "node_modules", ".bin", "tsc");

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      verbatimModuleSyntax: true,
      allowImportingTsExtensions: true,
    },
    include: [".thunderjar/**/*.ts"],
  },
  null,
  2,
);

async function setUp(testCase: string): Promise<string> {
  const dir = await tmp();
  await createFixtureProject(dir);
  await linkThunderjar(dir);
  await generate(dir);
  await writeFile(join(dir, ".thunderjar", "test-cases", "bad.ts"), testCase);
  await writeFile(join(dir, "tsconfig.json"), TSCONFIG);
  return dir;
}

async function runTsc(dir: string): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn([tsc, "--noEmit", "-p", join(dir, "tsconfig.json")], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { exitCode, output: stdout + stderr };
}

test(
  "a test case naming only generated names compiles cleanly",
  async () => {
    const dir = await setUp(`import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`);

    const { exitCode, output } = await runTsc(dir);
    expect(output).toBe("");
    expect(exitCode).toBe(0);
  },
  30000,
);

test(
  "a test case naming an unknown prompt set fails to compile",
  async () => {
    const dir = await setUp(`import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["totally-unknown-prompt-set"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`);

    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("totally-unknown-prompt-set");
  },
  30000,
);

test(
  "a test case naming a model absent from its family fails to compile",
  async () => {
    const dir = await setUp(`import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/gpt-luna"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`);

    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("claude-code@2.1.283/gpt-luna");
  },
  30000,
);

test(
  "an initial prompt belonging to a different task fails to compile",
  async () => {
    const dir = await setUp(`import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["basic"],
  iterations: 1,
});
`);
    const basicPromptDir = join(dir, ".thunderjar", "test-case-parameters", "tasks", "add-function", "initial-prompts");
    await mkdir(basicPromptDir, { recursive: true });
    await writeFile(
      join(basicPromptDir, "basic.ts"),
      `import { declareInitialPrompt } from "thunderjar";

export default declareInitialPrompt({
  prompt: "Write a function called add.",
  timeoutSeconds: 600,
  applyParameter: () => \`\`,
});
`,
    );
    await generate(dir); // "basic" now belongs only to add-function, not is-prime

    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("basic");
  },
  30000,
);
