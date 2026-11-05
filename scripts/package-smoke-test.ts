#!/usr/bin/env bun
// The installed package's smoke test: builds and packs Thunderjar, installs the tarball into an
// empty JavaScript project in a temporary folder, the way a user would, and runs `init`,
// `generate`, `plan` of both its test cases, and `build` and `run --dry-run` of one, there with its own `thunderjar`. Then it
// starts `view`, and fetches its page and the page's script. Every
// other test runs Thunderjar from source; this one runs only what's published.
//
//   bun run test:package
//
// Exits 1, printing the failing command's output, if a step fails. The temporary folder is removed
// either way.
import { $ } from "bun";

const ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const TEMP = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-package-${crypto.randomUUID()}`;
const PROJECT = `${TEMP}/project`;

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
      "measurements/isPrimeTemplateTest.ts",
      "measurements/templates/isPrime.test.ts.template",
      "measurements/tsIgnoreCount.ts",
    ],
  },
  { args: ["generate"], expect: ["parameterNames.d.ts"] },
  { args: ["plan", "compare-models"], expect: ["claude-code-2.1.311/claude-haiku-4-5-20251001", "claude-code-2.1.311/claude-haiku-5-5"] },
  {
    args: ["plan", "compare-harnesses"],
    expect: ["claude-code-2.1.311/claude-haiku-5-5", "copilot-1.0.105/claude-haiku-5.5", "opencode-1.19.5/opencode/claude-haiku-5-5"],
  },
  // bun, which the templateTest measurement runs its tests with, is in the base image.
  { args: ["build", "compare-models", "--dry-run"], expect: ["npm install --global bun@1.3.14", "@anthropic-ai/claude-code@2.1.311"] },
  { args: ["run", "compare-models", "--dry-run"], expect: ["claude -p"] },
];

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
  await mustRun("build", $`bun run build`.cwd(ROOT));
  // npm pack prints the tarball's name last on stdout, and its notices on stderr.
  const packed = (await mustRun("pack", $`npm pack --pack-destination ${TEMP}`.cwd(ROOT))).stdout.trim().split("\n").at(-1) as string;
  console.log(`packed ${packed}`);

  await mustRun("npm init", $`npm init --yes`.cwd(PROJECT));
  await mustRun("install", $`npm install --no-audit --no-fund ${`${TEMP}/${packed}`}`.cwd(PROJECT));
  console.log("installed into <temp>");

  const width = Math.max(...STEPS.map(({ args }) => `thunderjar ${args.join(" ")}`.length));
  for (const { args, expect } of STEPS) {
    const step = `thunderjar ${args.join(" ")}`.padEnd(width);
    // init's harnesses need their keys to plan or run; nothing here reaches any of them.
    const { output } = await mustRun(step, $`npx --no-install thunderjar ${args}`.cwd(PROJECT).env({ ...Bun.env, ...KEYS }));
    const missing = expect.find((text) => !output.includes(text));
    if (missing !== undefined) fail(step, `Expected the output to include ${JSON.stringify(missing)}:\n${output}`);
    console.log(`${step}  ok`);
  }
  const step = "thunderjar view".padEnd(width);
  await checkView(step);
  console.log(`${step}  ok`);
} catch (error) {
  if (!(error instanceof StepFailed)) throw error;
  console.log(`${error.step}  FAILED`);
  console.error(error.output.trim());
  process.exitCode = 1;
} finally {
  await $`rm -rf ${TEMP}`.quiet();
}
