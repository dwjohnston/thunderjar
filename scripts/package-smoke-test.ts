#!/usr/bin/env bun
// The installed package's smoke test: builds and packs Thunderjar, installs the tarball into an
// empty JavaScript project in a temporary folder, the way a user would, and runs `init`,
// `generate`, a `measure()` test with `bun test`, `run --dry-run` of both its test cases, and `capture install`
// and `capture list`, there with its own `thunderjar`. Then it
// starts `view`, and fetches its page and the page's script. Every
// other test runs Thunderjar from source; this one runs only what's published.
//
//   bun run test:package
//   bun run test:package --quickstart
//
// --quickstart then follows the docs' quick start for real: `thunderjar run compare-models`, with
// the real ANTHROPIC_API_KEY, Docker and a real model. It costs a few cents, so CI runs it only on
// the release PR.
//
// Exits 1, printing the failing command's output, if a step fails. The temporary folder is removed
// either way.
import { $ } from "bun";
import { packThunderjar } from "../src/cli/commands/capture/sampleRepoImage.ts";

const TEMP = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-package-${crypto.randomUUID()}`;
const PROJECT = `${TEMP}/project`;
const QUICKSTART = Bun.argv.includes("--quickstart");

/** The keys of the harnesses init's test cases use. Placeholders: nothing here reaches an agent. */
const KEYS = { ANTHROPIC_API_KEY: "smoke-test", COPILOT_GITHUB_TOKEN: "smoke-test", OPENCODE_API_KEY: "smoke-test" };

/** The commands run in the project, and what each one's output must contain. */
const STEPS: { args: string[]; expect: string[] }[] = [
  {
    args: ["init"],
    expect: [
      "test-cases/compare-models.ts",
      "test-cases/compare-harnesses.ts",
      "promptSets/house-style/files/AGENTS.md",
      "harnessModels/opencode-1.19.5/index.ts",
      "measurements/isPrimeTests.ts",
      "measurements/isPrime.test.ts",
      "measurements/tsIgnoreCount.ts",
    ],
  },
  { args: ["generate"], expect: ["parameterNames.d.ts"] },
  // The plan, each container, and each prerun image's Dockerfile. bun, which the bunTestFile
  // measurement runs its tests with, is in the base image. The harness writes the run script, and
  // the initial prompt the prompt, into the image.
  {
    args: ["run", "compare-models", "--dry-run"],
    expect: [
      "claude-code-2.1.311/claude-haiku-4-5-20251001",
      "claude-code-2.1.311/claude-haiku-5-5",
      "sh /thunderjar/thunderjar-run.sh",
      "npm install --global bun@1.3.14",
      "@anthropic-ai/claude-code@2.1.311",
      "claude -p",
      "/thunderjar/prompt.txt",
    ],
  },
  {
    args: ["run", "compare-harnesses", "--dry-run"],
    expect: ["claude-code-2.1.311/claude-haiku-5-5", "copilot-1.0.105/claude-haiku-5.5", "opencode-1.19.5/opencode/claude-haiku-5-5"],
  },
  // Capture keeps its records in the project's git repository, made by `git init` before the steps.
  { args: ["capture", "install", "--harness", "claude-code"], expect: [".claude/settings.local.json"] },
  { args: ["capture", "list"], expect: ["No captures."] },
];

/** A test of a measurement, as a user would write one, run with `bun test` in the installed project. */
const MEASURE_TEST = `import { expect, test } from "bun:test";
import { declareMeasurement } from "thunderjar";
import { measure } from "thunderjar/testing";

test("measure() runs from the installed package", async () => {
  const hasHello = declareMeasurement({
    instrument: "grep",
    config: { glob: "a.txt", pattern: "hello" },
    metrics: { hello: { stat: "sum" } },
  });
  await Bun.write("fixture.txt", "hello\\n");
  const result = await measure(hasHello, { files: { "a.txt": "fixture.txt" } });
  expect(result.metrics.hello).toBe(1);
});
`;

/** A step that failed, with its output. */
class StepFailed extends Error {
  constructor(
    readonly step: string,
    readonly output: string,
  ) {
    super(`${step} failed`);
  }
}

const fail = (step: string, output: string): never => {
  throw new StepFailed(step, output);
};

/** Runs `command`, returning its stdout and all its output, or failing the smoke test at `step`. */
async function mustRun(step: string, command: ReturnType<typeof $>): Promise<{ stdout: string; output: string }> {
  const result = await command.quiet().nothrow();
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  if (result.exitCode !== 0) fail(step, output);
  return { stdout: result.stdout.toString(), output };
}

/** Starts `thunderjar view` in the project, and fails unless its page and the page's script are served. */
async function checkView(step: string): Promise<void> {
  // The installed bin directly, not through npx, so killing it stops the server.
  const proc = Bun.spawn([`${PROJECT}/node_modules/.bin/thunderjar`, "view", "--port", "0"], { cwd: PROJECT, stdout: "pipe", stderr: "pipe" });
  try {
    let stdout = "";
    const reader = proc.stdout.getReader();
    while (!/Open \S+\n/.test(stdout)) {
      const { value, done } = await reader.read();
      if (done) fail(step, `${stdout}${await new Response(proc.stderr).text()}`);
      stdout += new TextDecoder().decode(value);
    }
    const url = /Open (\S+)/.exec(stdout)![1]!;
    const page = await (await fetch(url)).text();
    const script = /<script[^>]* src="([^"]+)"/.exec(page)?.[1];
    if (script === undefined) fail(step, `Expected the page to have a script:\n${page}`);
    const res = await fetch(new URL(script!, url));
    if (!res.ok) fail(step, `Expected ${script} to be served, got ${res.status}`);
  } finally {
    proc.kill();
    await proc.exited;
  }
}

try {
  await $`mkdir -p ${PROJECT}`.quiet();
  const tarball = await packThunderjar(TEMP).catch((error: unknown) => fail("build and pack", error instanceof Error ? error.message : String(error)));
  console.log(`packed ${tarball.slice(TEMP.length + 1)}`);

  await mustRun("npm init", $`npm init --yes`.cwd(PROJECT));
  await mustRun("git init", $`git init -q`.cwd(PROJECT));
  await mustRun("install", $`npm install --no-audit --no-fund ${tarball}`.cwd(PROJECT));
  console.log("installed into <temp>");

  const width = Math.max(...STEPS.map(({ args }) => `thunderjar ${args.join(" ")}`.length));
  for (const { args, expect } of STEPS) {
    const step = `thunderjar ${args.join(" ")}`.padEnd(width);
    // init's harnesses need their keys to run, even dry; nothing here reaches any of them.
    const { output } = await mustRun(step, $`npx --no-install thunderjar ${args}`.cwd(PROJECT).env({ ...Bun.env, ...KEYS }));
    const missing = expect.find((text) => !output.includes(text));
    if (missing !== undefined) fail(step, `Expected the output to include ${JSON.stringify(missing)}:\n${output}`);
    console.log(`${step}  ok`);
  }
  await Bun.write(`${PROJECT}/measure.test.ts`, MEASURE_TEST);
  const measureStep = "bun test measure()".padEnd(width);
  await mustRun(measureStep, $`bun test ./measure.test.ts`.cwd(PROJECT));
  console.log(`${measureStep}  ok`);
  const step = "thunderjar view".padEnd(width);
  await checkView(step);
  console.log(`${step}  ok`);

  if (QUICKSTART) {
    const step = "thunderjar run compare-models".padEnd(width);
    if (!Bun.env.ANTHROPIC_API_KEY) fail(step, "--quickstart needs ANTHROPIC_API_KEY");
    // The quick start's command as the docs give it, with the real environment: no placeholder keys.
    await mustRun(step, $`npx --no-install thunderjar run compare-models`.cwd(PROJECT));
    console.log(`${step}  ok`);
  }
} catch (error) {
  if (!(error instanceof StepFailed)) throw error;
  console.log(`${error.step}  FAILED`);
  console.error(error.output.trim());
  process.exitCode = 1;
} finally {
  await $`rm -rf ${TEMP}`.quiet();
}
