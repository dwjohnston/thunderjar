import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";
import { plan } from "./plan.ts";
import { run } from "./run.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-run-"));

const cli = resolve(import.meta.dir, "..", "cli", "index.ts");

const ID = "01k4x9j2e8mqz3abcdefghjkmn";
const newExecutionId = () => ID;

const ULID = /^[0-9a-hjkmnp-tv-z]{26}$/;

// One prompt set and both harness/model pairs, two iterations: small enough to assert whole.
const TWO_PAIRS = stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5", "codex@0.9.0/gpt-luna"],
  task: "is-prime",
  initialPrompt: ["terse"],
  iterations: 2,
}`);

// The prerun hashes are those `plan` shows for the same permutations (src/commands/plan.test.ts).
const TWO_PAIRS_EXPECTED = `Execution ${ID} (dry run, 2 permutations × 2 iterations)

Permutation 1/2  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5 | terse
  prerun-h4fcb1a62
  iteration 1/2  postrun-e${ID}-h4fcb1a62-i00
    claude -p "isPrime.ts: export a primality test." --model claude-haiku-4-5-20251001 > /thunderjar/result.json
  iteration 2/2  postrun-e${ID}-h4fcb1a62-i01
    claude -p "isPrime.ts: export a primality test." --model claude-haiku-4-5-20251001 > /thunderjar/result.json

Permutation 2/2  node20 | baseline | snerk | codex@0.9.0/gpt-luna          | terse
  prerun-he8af79ce
  iteration 1/2  postrun-e${ID}-he8af79ce-i00
    codex exec "isPrime.ts: export a primality test." --model gpt-luna > /thunderjar/result.json
  iteration 2/2  postrun-e${ID}-he8af79ce-i01
    codex exec "isPrime.ts: export a primality test." --model gpt-luna > /thunderjar/result.json`;

async function fixture(changes: Record<string, string | null> = {}) {
  const dir = await tmp();
  await createFixtureProject(dir, changes);
  await linkThunderjar(dir);
  return dir;
}

async function spawnCli(dir: string, ...args: string[]) {
  const proc = Bun.spawn(["bun", cli, ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

/** The top level of `dir` and everything under `.thunderjar/`, so a test can show nothing was written. */
const listTree = (dir: string) => [
  ...readdirSync(dir),
  ...readdirSync(join(dir, ".thunderjar"), { recursive: true }).map(String),
].toSorted();

test("prints each permutation's prerun image, then each iteration's postrun image and harness command", async () => {
  const dir = await fixture({ "test-cases/two-pairs.ts": TWO_PAIRS });
  expect(await run("two-pairs", { dryRun: true, cwd: dir, newExecutionId })).toBe(TWO_PAIRS_EXPECTED);
});

test("`thunderjar run --dry-run` prints the same, under a new ULID, and writes nothing", async () => {
  const dir = await fixture({ "test-cases/two-pairs.ts": TWO_PAIRS });
  const before = listTree(dir);

  const { stdout, stderr, exitCode } = await spawnCli(dir, "run", "two-pairs", "--dry-run");

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const id = /^Execution (\S+) /.exec(stdout)![1]!;
  expect(id).toMatch(ULID);
  expect(stdout).toBe(`${TWO_PAIRS_EXPECTED.replaceAll(ID, id)}\n`);
  expect(listTree(dir)).toEqual(before);
});

test("each invocation gets its own execution ID", async () => {
  const dir = await fixture();
  const first = await run("is-prime-baseline", { dryRun: true, cwd: dir });
  const second = await run("is-prime-baseline", { dryRun: true, cwd: dir });
  const idOf = (output: string) => /^Execution (\S+) /.exec(output)![1]!;
  expect(idOf(first)).toMatch(ULID);
  expect(idOf(first)).not.toBe(idOf(second));
});

test("walks permutations in plan's order, with every iteration inside each", async () => {
  const dir = await fixture();
  const output = await run("is-prime-baseline", { dryRun: true, cwd: dir, newExecutionId });
  const lines = output.split("\n");

  expect(lines[0]).toBe(`Execution ${ID} (dry run, 8 permutations × 5 iterations)`);
  expect(output.match(/prerun-h[0-9a-f]{8}/g)).toEqual((await plan("is-prime-baseline", dir)).match(/prerun-h[0-9a-f]{8}/g));

  // Each permutation header is followed by its prerun image and five iterations, i00 to i04.
  const permutationLines = lines.filter((line) => line.startsWith("Permutation "));
  expect(permutationLines.map((line) => line.split("  ")[0])).toEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Permutation ${n}/8`),
  );
  const iterationLines = lines.filter((line) => line.startsWith("  iteration "));
  expect(iterationLines).toHaveLength(40);
  iterationLines.forEach((line, i) => {
    expect(line).toContain(`iteration ${(i % 5) + 1}/5  postrun-e${ID}-h`);
    expect(line).toEndWith(`-i0${i % 5}`);
  });

  expect(lines.slice(2, 6).join("\n")).toBe(`Permutation 1/8  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5 | plain
  prerun-h848b6f74
  iteration 1/5  postrun-e${ID}-h848b6f74-i00
    claude -p "Create a file isPrime.ts exporting a function that tests for primality." --model claude-haiku-4-5-20251001 > /thunderjar/result.json`);
});

test("uses the selected version's cli override, and indents every line of a multi-line command", async () => {
  const dir = await fixture({
    "test-case-parameters/harnessModels/claude-code/versions.ts": stub("declareHarnessVersions", `{
  "2.1.283": { version: "2.1.283" },
  "2.2.0": {
    version: "2.2.0",
    cli: (ctx) => \`cd /workspace\\nclaude@\${ctx.version} -p "\${ctx.initialPrompt}" --model \${ctx.modelId} > \${ctx.resultPath}\`,
  },
}`),
    "test-cases/override.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.2.0/sonnet-5-5"],
  task: "is-prime",
  initialPrompt: ["terse"],
  iterations: 1,
}`),
  });

  const output = await run("override", { dryRun: true, cwd: dir, newExecutionId });
  expect(output.split("\n").slice(5).join("\n")).toBe(
    `    cd /workspace
    claude@2.2.0 -p "isPrime.ts: export a primality test." --model claude-sonnet-5-5 > /thunderjar/result.json`,
  );
  expect(output).toStartWith(`Execution ${ID} (dry run, 1 permutation × 1 iteration)`);
});

test("without --dry-run, says only dry runs are supported so far", async () => {
  const dir = await fixture();
  await expect(run("is-prime-baseline", { dryRun: false, cwd: dir })).rejects.toThrow(/only supports --dry-run/);

  const { stdout, stderr, exitCode } = await spawnCli(dir, "run", "is-prime-baseline");
  expect(stdout).toBe("");
  expect(stderr).toContain("only supports --dry-run");
  expect(exitCode).toBe(1);
});

test("prints usage for a missing test case name or an unknown flag", async () => {
  const dir = await fixture();
  for (const args of [["run", "--dry-run"], ["run", "is-prime-baseline", "--dry-run", "--json"]]) {
    const { stderr, exitCode } = await spawnCli(dir, ...args);
    expect(stderr).toBe("usage: thunderjar run <test case> --dry-run\n");
    expect(exitCode).toBe(1);
  }
});

test("reports an unknown test case as a configuration error", async () => {
  const dir = await fixture();
  const { stderr, exitCode } = await spawnCli(dir, "run", "no-such-test-case", "--dry-run");
  expect(stderr).toContain(`no test case named "no-such-test-case"`);
  expect(exitCode).toBe(1);
});
