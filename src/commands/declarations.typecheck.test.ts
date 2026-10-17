// Confirms the mechanism described in
// spec/055-declaring-test-cases.md#typed-names actually works: a test case naming a
// parameter absent from the generated types is a compile error, and one naming only
// generated names compiles cleanly. Runs real `tsc` against a throwaway project, so
// each case gets its own process.

import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generate } from "./generate/generate.ts";
import { createFixtureProject, linkThunderjar } from "../testing/fixture-project.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-typecheck-"));
const tsc = resolve(import.meta.dir, "..", "..", "node_modules", ".bin", "tsc");

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
    // Templates aren't TypeScript until rendered, as in the tsconfig `init` scaffolds.
    exclude: [".thunderjar/**/*.template.ts"],
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
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
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
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
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
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-huge"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`);

    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("fake-harness-alpha@1.0.0/fake-model-huge");
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
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
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

/** The fixture project with one more measurement on is-prime, `bad.ts`, whose body is `body`. */
async function setUpMeasurement(body: string): Promise<string> {
  const dir = await setUp(`export {};\n`);
  const measurements = join(dir, ".thunderjar", "test-case-parameters", "tasks", "is-prime", "measurements");
  await mkdir(measurements, { recursive: true });
  await writeFile(
    join(measurements, "bad.ts"),
    `import { declareMeasurement } from "thunderjar";\n\nexport default declareMeasurement(${body});\n`,
  );
  return dir;
}

test(
  "a measurement whose config fits its instrument compiles cleanly",
  async () => {
    const dir = await setUpMeasurement(`{ instrument: "fileCreated", config: { glob: "src/**/*.ts" }, aggregate: ["rate", "count"] }`);
    const { exitCode, output } = await runTsc(dir);
    expect(output).toBe("");
    expect(exitCode).toBe(0);
  },
  30000,
);

test(
  "a measurement whose config doesn't fit its instrument fails to compile",
  async () => {
    const dir = await setUpMeasurement(`{ instrument: "fileCreated", config: { path: "isPrime.ts" }, aggregate: ["rate"] }`);
    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("bad.ts");
    expect(output).toContain("path");
  },
  30000,
);

test(
  "a measurement naming an unknown instrument fails to compile",
  async () => {
    const dir = await setUpMeasurement(`{ instrument: "fileCraeted", config: { glob: "isPrime.ts" }, aggregate: ["rate"] }`);
    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("fileCraeted");
  },
  30000,
);

test(
  "grep and templateTest measurements whose config and aggregate fit compile cleanly",
  async () => {
    const dir = await setUpMeasurement(`{ instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" }, aggregate: ["mean", "max"] }`);
    await writeFile(
      join(dir, ".thunderjar", "test-case-parameters", "tasks", "is-prime", "measurements", "good.ts"),
      `import { declareMeasurement } from "thunderjar";\n\nexport default declareMeasurement({ instrument: "templateTest", config: { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" }, aggregate: ["sum", "mean"] });\n`,
    );
    const { exitCode, output } = await runTsc(dir);
    expect(output).toBe("");
    expect(exitCode).toBe(0);
  },
  30000,
);

test(
  "an aggregate that doesn't fit grep's or templateTest's value type, or a config missing a field, fails to compile",
  async () => {
    for (const body of [
      `{ instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" }, aggregate: ["rate"] }`,
      `{ instrument: "grep", config: { glob: "**/*.ts" }, aggregate: ["max"] }`,
      `{ instrument: "templateTest", config: { subject: "**/isPrime.ts", template: "./t.ts" }, aggregate: ["max"] }`,
      `{ instrument: "templateTest", config: { subject: "**/isPrime.ts" }, aggregate: ["sum"] }`,
    ]) {
      const dir = await setUpMeasurement(body);
      const { exitCode, output } = await runTsc(dir);
      expect(exitCode).not.toBe(0);
      expect(output).toContain("bad.ts");
    }
  },
  60000,
);

test(
  "a measurement without an aggregate, or with one that doesn't fit its value type, fails to compile",
  async () => {
    for (const body of [
      `{ instrument: "fileCreated", config: { glob: "isPrime.ts" } }`,
      `{ instrument: "fileCreated", config: { glob: "isPrime.ts" }, aggregate: ["mean"] }`,
    ]) {
      const dir = await setUpMeasurement(body);
      const { exitCode, output } = await runTsc(dir);
      expect(exitCode).not.toBe(0);
      expect(output).toContain("bad.ts");
    }
  },
  30000,
);

/** The fixture project with its baseline code state's declaration replaced by `source`. */
async function setUpCodeState(source: string): Promise<string> {
  const dir = await setUp(`export {};\n`);
  await writeFile(join(dir, ".thunderjar", "test-case-parameters", "codeStates", "baseline", "index.ts"), source);
  return dir;
}

test(
  "a parameter's config reaches its applyParameter typed, and checkoutCommit takes its ctx",
  async () => {
    const dir = await setUpCodeState(`import { checkoutCommit, declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { commit: "a1b2c3", install: "npm ci" },
  applyParameter: (config, ctx) => \`\${checkoutCommit(ctx, config.commit)}\\nRUN \${config.install}\`,
});
`);
    const { exitCode, output } = await runTsc(dir);
    expect(output).toBe("");
    expect(exitCode).toBe(0);
  },
  30000,
);

test(
  "reading a property the config doesn't have fails to compile",
  async () => {
    const dir = await setUpCodeState(`import { declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { commit: "a1b2c3" },
  applyParameter: (config) => \`RUN git checkout \${config.sha}\`,
});
`);
    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("codeStates/baseline/index.ts");
    expect(output).toContain("'sha' does not exist");
  },
  30000,
);

test(
  "a code state's old top-level commit fails to compile: it belongs in config",
  async () => {
    const dir = await setUpCodeState(`import { declareCodeState } from "thunderjar";

export default declareCodeState({
  commit: "a1b2c3",
  applyParameter: () => \`RUN npm ci\`,
});
`);
    const { exitCode, output } = await runTsc(dir);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("'commit' does not exist");
  },
  30000,
);
