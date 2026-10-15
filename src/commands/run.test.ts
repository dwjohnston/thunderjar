import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";
import { plan } from "./plan.ts";
import { run, type RunOptions } from "./run.ts";

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

/** Everything `run` prints, as one string. */
async function printed(name: string, options: RunOptions) {
  const blocks: string[] = [];
  await run(name, { ...options, log: (text) => blocks.push(text) });
  return blocks.join("\n");
}

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
  expect(await printed("two-pairs", { dryRun: true, cwd: dir, newExecutionId })).toBe(TWO_PAIRS_EXPECTED);
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
  const first = await printed("is-prime-baseline", { dryRun: true, cwd: dir });
  const second = await printed("is-prime-baseline", { dryRun: true, cwd: dir });
  const idOf = (output: string) => /^Execution (\S+) /.exec(output)![1]!;
  expect(idOf(first)).toMatch(ULID);
  expect(idOf(first)).not.toBe(idOf(second));
});

test("walks permutations in plan's order, with every iteration inside each", async () => {
  const dir = await fixture();
  const output = await printed("is-prime-baseline", { dryRun: true, cwd: dir, newExecutionId });
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

  const output = await printed("override", { dryRun: true, cwd: dir, newExecutionId });
  expect(output.split("\n").slice(5).join("\n")).toBe(
    `    cd /workspace
    claude@2.2.0 -p "isPrime.ts: export a primality test." --model claude-sonnet-5-5 > /thunderjar/result.json`,
  );
  expect(output).toStartWith(`Execution ${ID} (dry run, 1 permutation × 1 iteration)`);
});

test("prints usage for a missing test case name or an unknown flag", async () => {
  const dir = await fixture();
  for (const args of [["run"], ["run", "--dry-run"], ["run", "is-prime-baseline", "--dry-run", "--json"]]) {
    const { stderr, exitCode } = await spawnCli(dir, ...args);
    expect(stderr).toBe("usage: thunderjar run <test case> [--dry-run]\n");
    expect(exitCode).toBe(1);
  }
});

test("reports an unknown test case as a configuration error", async () => {
  const dir = await fixture();
  const { stderr, exitCode } = await spawnCli(dir, "run", "no-such-test-case", "--dry-run");
  expect(stderr).toContain(`no test case named "no-such-test-case"`);
  expect(exitCode).toBe(1);
});

// --- Running for real, on the host, with the fake agent (fake-agent@1.0.0/fake) ---

/** A clock that moves 40 ms each time it is read, so every container run takes 0.04s. */
const stubClock = () => {
  let t = 1790692255104;
  return () => (t += 40);
};

/** Runs `name` for real with the ID and clock stubbed, keeping container runs under a fresh root. */
async function runForReal(dir: string, name: string) {
  const rootDir = await tmp();
  const stdout = await printed(name, { dryRun: false, cwd: dir, newExecutionId, now: stubClock(), rootDir });
  return { stdout, executionDir: join(rootDir, ID) };
}

/** The host's stand-in for one postrun image: what the fake agent left, and run.json. */
const containerRun = (executionDir: string, tag: string) => {
  const dir = join(executionDir, tag);
  const read = (rel: string) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : undefined);
  return {
    workspace: readdirSync(join(dir, "workspace")).toSorted(),
    fakeAgentFile: read("workspace/fake-agent.txt"),
    result: read("thunderjar/result.json"),
    run: JSON.parse(read("thunderjar/run.json")!) as { startedAt: number; finishedAt: number; exitCode: number },
  };
};

const FAKE = `postrun-e${ID}-h`;

test("runs each container run on the host, leaving the agent's files, its result and run.json", async () => {
  const dir = await fixture();
  const { stdout, executionDir } = await runForReal(dir, "fake-is-prime");

  const tag = /iteration 1\/2  (\S+)/.exec(stdout)![1]!;
  const hash = tag.slice(FAKE.length, -"-i00".length);
  expect(stdout).toBe(`Execution ${ID} (1 permutation × 2 iterations)
Output in ${executionDir}

Permutation 1/1  node20 | baseline | snerk | fake-agent@1.0.0/fake | plain
  iteration 1/2  ${FAKE}${hash}-i00  exit 0  0.04s
  iteration 2/2  ${FAKE}${hash}-i01  exit 0  0.04s

2 container runs: 2 exited 0`);

  expect(readdirSync(executionDir).toSorted()).toEqual([`${FAKE}${hash}-i00`, `${FAKE}${hash}-i01`]);
  for (const tag of readdirSync(executionDir)) {
    const { workspace, fakeAgentFile, result, run } = containerRun(executionDir, tag);
    expect(workspace).toEqual(["fake-agent.txt"]);
    expect(fakeAgentFile).toBe("Create a file isPrime.ts exporting a function that tests for primality.\n");
    expect(result).toBe(`{"model":"fake-model"}\n`);
    expect(run.exitCode).toBe(0);
    expect(run.finishedAt - run.startedAt).toBe(40);
  }
});

test("`thunderjar run` runs under a new ULID in $TMPDIR/thunderjar, and leaves the project unchanged", async () => {
  const dir = await fixture();
  const tmpDir = await tmp();
  const before = listTree(dir);

  const proc = Bun.spawn(["bun", cli, "run", "fake-is-prime"], {
    cwd: dir,
    env: { ...process.env, TMPDIR: tmpDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const id = /^Execution (\S+) /.exec(stdout)![1]!;
  expect(id).toMatch(ULID);
  const executionDir = join(tmpDir, "thunderjar", id);
  expect(stdout).toMatch(
    new RegExp(
      `^Execution ${id} \\(1 permutation × 2 iterations\\)\n` +
        `Output in ${executionDir}\n\n` +
        `Permutation 1/1  node20 \\| baseline \\| snerk \\| fake-agent@1.0.0/fake \\| plain\n` +
        `  iteration 1/2  postrun-e${id}-h[0-9a-f]{8}-i00  exit 0  \\d+\\.\\d\\ds\n` +
        `  iteration 2/2  postrun-e${id}-h[0-9a-f]{8}-i01  exit 0  \\d+\\.\\d\\ds\n\n` +
        `2 container runs: 2 exited 0\n$`,
    ),
  );
  for (const tag of readdirSync(executionDir)) {
    const { workspace, run } = containerRun(executionDir, tag);
    expect(workspace).toEqual(["fake-agent.txt"]);
    expect(run.exitCode).toBe(0);
    expect(run.finishedAt).toBeGreaterThanOrEqual(run.startedAt);
  }
  expect(listTree(dir)).toEqual(before);
});

test("records a failing cli's exit code, and still runs the remaining iterations", async () => {
  const dir = await fixture({
    // 1.0.1 writes its file, then fails.
    "test-case-parameters/harnessModels/fake-agent/versions.ts": stub("declareHarnessVersions", `{
  "1.0.0": { version: "1.0.0" },
  "1.0.1": { version: "1.0.1", cli: () => \`touch fake-agent.txt && exit 3\` },
}`),
    "test-cases/fake-fails.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-agent@1.0.1/fake", "fake-agent@1.0.0/fake"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 2,
}`),
  });
  const { stdout, executionDir } = await runForReal(dir, "fake-fails");

  const lines = stdout.split("\n");
  const exits = lines.filter((line) => line.startsWith("  iteration ")).map((line) => / exit (\d+) /.exec(line)![1]);
  const failing = lines.findIndex((line) => line.includes("fake-agent@1.0.1/fake"));
  expect(exits).toEqual(failing === 3 ? ["3", "3", "0", "0"] : ["0", "0", "3", "3"]);
  expect(lines.at(-1)).toBe("4 container runs: 2 exited 0, 2 exited 3");

  const runs = readdirSync(executionDir).map((tag) => containerRun(executionDir, tag));
  expect(runs).toHaveLength(4);
  expect(runs.map(({ run }) => run.exitCode).toSorted()).toEqual([0, 0, 3, 3]);
  // Every run left its file, including those after the failures.
  for (const { workspace } of runs) expect(workspace).toEqual(["fake-agent.txt"]);
});

test("kills a cli that runs past the initial prompt's timeoutSeconds, recording exit code 124", async () => {
  const dir = await fixture({
    "test-case-parameters/tasks/is-prime/initial-prompts/plain.ts": stub("declareInitialPrompt", `{
  prompt: "Take your time.",
  timeoutSeconds: 1,
  applyParameter: () => \`\`,
}`),
    "test-case-parameters/harnessModels/fake-agent/index.ts": stub("declareHarness", `{
  applyParameter: () => \`\`,
  cli: () => \`touch started.txt && sleep 2 && touch finished.txt\`,
}`),
  });
  const rootDir = await tmp();
  const startedAt = Date.now();
  const stdout = await printed("fake-is-prime", { dryRun: false, cwd: dir, newExecutionId, rootDir });
  const elapsed = Date.now() - startedAt;

  // Each of the two iterations is killed at about a second, well before `sleep 2` ends.
  expect(elapsed).toBeLessThan(3500);
  expect(stdout.split("\n").at(-1)).toBe("2 container runs: 2 exited 124");
  await Bun.sleep(1500); // past when `sleep 2` would have finished
  const executionDir = join(rootDir, ID);
  for (const tag of readdirSync(executionDir)) {
    const { workspace, run } = containerRun(executionDir, tag);
    expect(workspace).toEqual(["started.txt"]);
    expect(run.exitCode).toBe(124);
    expect(run.finishedAt - run.startedAt).toBeGreaterThanOrEqual(1000);
    expect(run.finishedAt - run.startedAt).toBeLessThan(1900);
  }
});
