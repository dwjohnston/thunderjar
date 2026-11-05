#!/usr/bin/env bun
// The installed package's smoke test: builds and packs Thunderjar, installs the tarball into an
// empty JavaScript project in a temporary folder, the way a user would, and runs `init`,
// `generate`, `plan example` and `run example --dry-run` there with its own `thunderjar`. Every
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

/** The commands run in the project, and what each one's output must contain. */
const STEPS: { args: string[]; expect: string[] }[] = [
  { args: ["init"], expect: ["test-cases/example.ts", "promptSets/house-style/files/AGENTS.md", "harnessModels/opencode/index.ts"] },
  { args: ["generate"], expect: ["parameterNames.d.ts"] },
  { args: ["plan", "example"], expect: ["claude-code@2.1.283/haiku-4-5"] },
  { args: ["run", "example", "--dry-run"], expect: ["claude -p"] },
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
    // init's Claude Code harness needs a key to plan or run; nothing here reaches Anthropic.
    const { output } = await mustRun(step, $`npx --no-install thunderjar ${args}`.cwd(PROJECT).env({ ...Bun.env, ANTHROPIC_API_KEY: "smoke-test" }));
    const missing = expect.find((text) => !output.includes(text));
    if (missing !== undefined) fail(step, `Expected the output to include ${JSON.stringify(missing)}:\n${output}`);
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
