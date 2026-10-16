// spec/100-cli-reference.md#conventions: a configuration error is reported as a clear
// message naming the file, the field and the offending value, with a non-zero exit code.
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";

const cli = resolve(import.meta.dir, "..", "cli", "index.ts");

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function project(changes: Record<string, string | null> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-validation-"));
  dirs.push(dir);
  await createFixtureProject(dir, changes);
  await linkThunderjar(dir);
  return dir;
}

async function run(dir: string, ...args: string[]) {
  const proc = Bun.spawn(["bun", cli, ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

const plan = (dir: string) => run(dir, "plan", "is-prime-baseline");

/** The fixture test case with some fields replaced. Values are written as source. */
function testCase(fields: Record<string, string> = {}) {
  const all: Record<string, string> = {
    baseImage: `["node20"]`,
    codeState: `["baseline"]`,
    promptSet: `["snerk", "glurk"]`,
    harnessModel: `["fake-harness-alpha@1.0.0/fake-model-small", "fake-harness-beta@1.0.0/fake-model-large"]`,
    task: `"is-prime"`,
    initialPrompt: `["plain", "terse"]`,
    iterations: `5`,
    ...fields,
  };
  const body = Object.entries(all)
    .map(([k, v]) => `  ${k}: ${v},`)
    .join("\n");
  return { "test-cases/is-prime-baseline.ts": stub("declareTestCase", `{\n${body}\n}`) };
}

const TEST_CASE = ".thunderjar/test-cases/is-prime-baseline.ts";

test("a valid project plans cleanly", async () => {
  const { stderr, exitCode } = await plan(await project());
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test("a name with no matching folder", async () => {
  const { stderr, exitCode } = await plan(await project(testCase({ promptSet: `["snerk", "snirk"]` })));
  expect(stderr).toBe(
    `error: ${TEST_CASE}: promptSet: "snirk" has no matching test-case-parameters/promptSets/snirk/index.ts\n`,
  );
  expect(exitCode).toBe(1);
});

test("a name whose folder was deleted after generate", async () => {
  const dir = await project();
  expect((await run(dir, "generate")).exitCode).toBe(0);
  await rm(join(dir, ".thunderjar", "test-case-parameters", "promptSets", "glurk"), { recursive: true });

  const { stderr, exitCode } = await plan(dir);
  expect(stderr).toBe(
    `error: ${TEST_CASE}: promptSet: "glurk" has no matching test-case-parameters/promptSets/glurk/index.ts\n`,
  );
  expect(exitCode).toBe(1);
});

test("a task with no folder", async () => {
  const { stderr, exitCode } = await plan(await project(testCase({ task: `"is-even"` })));
  expect(stderr).toBe(`error: ${TEST_CASE}: task: "is-even" has no matching test-case-parameters/tasks/is-even/\n`);
  expect(exitCode).toBe(1);
});

test("an initial prompt that belongs to a different task", async () => {
  const dir = await project({
    ...testCase({ initialPrompt: `["plain", "fizzy"]` }),
    "test-case-parameters/tasks/fizz-buzz/initial-prompts/fizzy.ts": stub(
      "declareInitialPrompt",
      `{ prompt: "FizzBuzz.", timeoutSeconds: 600, applyParameter: () => \`\` }`,
    ),
  });
  const { stderr, exitCode } = await plan(dir);
  expect(stderr).toBe(`error: ${TEST_CASE}: initialPrompt: "fizzy" belongs to task "fizz-buzz", not "is-prime"\n`);
  expect(exitCode).toBe(1);
});

test("a declaration file with no default export", async () => {
  const { stderr, exitCode } = await plan(
    await project({ "test-case-parameters/baseImages/node20/index.ts": `export const node20 = 1;\n` }),
  );
  expect(stderr).toBe(
    "error: .thunderjar/test-case-parameters/baseImages/node20/index.ts: has no default export. Export `declareBaseImage(...)` as the default.\n",
  );
  expect(exitCode).toBe(1);
});

test("a declaration not wrapped in its declareX", async () => {
  const { stderr, exitCode } = await plan(
    await project({
      "test-case-parameters/codeStates/baseline/index.ts": `export default { commit: "a1b2c3", applyParameter: () => "" };\n`,
    }),
  );
  expect(stderr).toBe(
    "error: .thunderjar/test-case-parameters/codeStates/baseline/index.ts: default export is not wrapped in declareCodeState(...).\n",
  );
  expect(exitCode).toBe(1);
});

test("a declaration wrapped in the wrong declareX", async () => {
  const { stderr, exitCode } = await plan(
    await project({
      "test-case-parameters/codeStates/baseline/index.ts": stub("declareBaseImage", `{ applyParameter: () => "" }`),
    }),
  );
  expect(stderr).toBe(
    "error: .thunderjar/test-case-parameters/codeStates/baseline/index.ts: default export is wrapped in declareBaseImage, expected declareCodeState.\n",
  );
  expect(exitCode).toBe(1);
});

test("a harness/model pair naming a version or model absent from its family", async () => {
  const dir = await project(
    testCase({ harnessModel: `["fake-harness-alpha@9.9.9/fake-model-small", "fake-harness-alpha@1.0.0/fake-model-huge", "fake-harness-beta-1.0.0"]` }),
  );
  const { stderr, exitCode } = await plan(dir);
  expect(stderr).toBe(
    [
      `error: ${TEST_CASE}: harnessModel: "fake-harness-alpha@9.9.9/fake-model-small": version "9.9.9" is not in test-case-parameters/harnessModels/fake-harness-alpha/versions.ts`,
      `error: ${TEST_CASE}: harnessModel: "fake-harness-alpha@1.0.0/fake-model-huge": model "fake-model-huge" is not in test-case-parameters/harnessModels/fake-harness-alpha/models.ts`,
      `error: ${TEST_CASE}: harnessModel: "fake-harness-beta-1.0.0" is not of the form family@version/model`,
      "",
    ].join("\n"),
  );
  expect(exitCode).toBe(1);
});

test("an empty array, and iterations that is not a positive integer", async () => {
  const { stderr, exitCode } = await plan(await project(testCase({ codeState: `[]`, iterations: `2.5` })));
  expect(stderr).toBe(
    [
      `error: ${TEST_CASE}: codeState: must name at least one value, got []`,
      `error: ${TEST_CASE}: iterations: must be a positive integer, got 2.5`,
      "",
    ].join("\n"),
  );
  expect(exitCode).toBe(1);

  const zero = await plan(await project(testCase({ iterations: `0` })));
  expect(zero.stderr).toBe(`error: ${TEST_CASE}: iterations: must be a positive integer, got 0\n`);
  expect(zero.exitCode).toBe(1);
});

test("generate reports an unwrapped family map", async () => {
  const { stderr, exitCode } = await run(
    await project({ "test-case-parameters/harnessModels/fake-harness-beta/versions.ts": `export default { "1.0.0": { version: "1.0.0" } };\n` }),
    "generate",
  );
  expect(stderr).toBe(
    "error: .thunderjar/test-case-parameters/harnessModels/fake-harness-beta/versions.ts: default export is not wrapped in declareHarnessVersions(...).\n",
  );
  expect(exitCode).toBe(1);
});

const MEASUREMENT = ".thunderjar/test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts";

const measurement = (body: string) => ({
  "test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts": stub("declareMeasurement", body),
});

test("a measurement naming an unknown instrument", async () => {
  const dir = await project(measurement(`{ instrument: "fileCraeted", config: { glob: "**/isPrime.ts" }, aggregate: ["rate"] }`));
  for (const result of [await plan(dir), await run(dir, "run", "fake-is-prime")]) {
    expect(result.stderr).toBe(
      `error: ${MEASUREMENT}: instrument: "fileCraeted" is not a known instrument. Known instruments: fileCreated, grep, templateTest\n`,
    );
    expect(result.exitCode).toBe(1);
  }
  // Nothing ran, so nothing was recorded.
  expect(existsSync(join(dir, ".thunderjar", ".data"))).toBe(false);
});

test("a measurement whose config doesn't fit its instrument, or with no aggregate", async () => {
  const { stderr, exitCode } = await plan(await project(measurement(`{ instrument: "fileCreated", config: { path: "isPrime.ts" } }`)));
  expect(stderr).toBe(
    [
      `error: ${MEASUREMENT}: config.glob: must be a glob pattern, got undefined`,
      `error: ${MEASUREMENT}: aggregate: must be an array of aggregation methods, got undefined`,
      "",
    ].join("\n"),
  );
  expect(exitCode).toBe(1);
});

test("a measurement not wrapped in declareMeasurement", async () => {
  const { stderr, exitCode } = await plan(
    await project({
      "test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts": `export default { instrument: "fileCreated" };\n`,
    }),
  );
  expect(stderr).toBe(`error: ${MEASUREMENT}: default export is not wrapped in declareMeasurement(...).\n`);
  expect(exitCode).toBe(1);
});

const TEMPLATE_TEST = ".thunderjar/test-case-parameters/tasks/is-prime/measurements/isPrimeTemplateTest.ts";

test("a templateTest measurement whose template is missing", async () => {
  const dir = await project({
    "test-case-parameters/tasks/is-prime/measurements/isPrimeTemplateTest.ts": stub(
      "declareMeasurement",
      `{ instrument: "templateTest", config: { subject: "**/isPrime.ts", template: "./isPrime.tset.template.ts" }, aggregate: ["sum"] }`,
    ),
  });
  for (const result of [await plan(dir), await run(dir, "run", "fake-is-prime")]) {
    expect(result.stderr).toBe(
      `error: ${TEMPLATE_TEST}: config.template: "./isPrime.tset.template.ts" has no matching test-case-parameters/tasks/is-prime/measurements/isPrime.tset.template.ts\n`,
    );
    expect(result.exitCode).toBe(1);
  }
  expect(existsSync(join(dir, ".thunderjar", ".data"))).toBe(false);
});

test("a measurement whose aggregate names a method its instrument's values don't combine by", async () => {
  const dir = await project(measurement(`{ instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, aggregate: ["rate", "mean", "avg"] }`));
  for (const result of [await plan(dir), await run(dir, "run", "fake-is-prime")]) {
    expect(result.stderr).toBe(
      [
        `error: ${MEASUREMENT}: aggregate: "mean" is not a way fileCreated's values combine. Use one of: rate, count`,
        `error: ${MEASUREMENT}: aggregate: "avg" is not a way fileCreated's values combine. Use one of: rate, count`,
        "",
      ].join("\n"),
    );
    expect(result.exitCode).toBe(1);
  }
  expect(existsSync(join(dir, ".thunderjar", ".data"))).toBe(false);
});

test("a grep measurement whose pattern isn't a valid regex", async () => {
  const { stderr, exitCode } = await plan(
    await project({
      "test-case-parameters/tasks/is-prime/measurements/tsIgnoreCount.ts": stub(
        "declareMeasurement",
        `{ instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore(" }, aggregate: ["max"] }`,
      ),
    }),
  );
  expect(stderr).toStartWith(
    `error: .thunderjar/test-case-parameters/tasks/is-prime/measurements/tsIgnoreCount.ts: config.pattern: "@ts-ignore(" is not a valid regular expression: `,
  );
  expect(exitCode).toBe(1);
});
