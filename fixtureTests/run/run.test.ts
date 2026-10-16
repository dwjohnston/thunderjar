// `thunderjar run` against the checked-in project in fixtures/, through the CLI, the way a
// developer would run it by hand:
//
//   cd fixtureTests/run/fixtures
//   bun ../../../src/cli/index.ts run two-pairs --dry-run
//   bun ../../../src/cli/index.ts run fake-is-prime
//
// (`thunderjar` must resolve from fixtures/; running this file once links it.)
//
// Each test case in fixtures/.thunderjar/test-cases/ is one scenario. What varies from run to
// run (the execution ID, $TMPDIR and durations) is replaced with placeholders, so the
// expected output reads like what is printed. Real runs work on a copy of fixtures/, because
// they write .thunderjar/.data/; a manual real run writes it there, and it's gitignored.
//
// Crashes partway through need a runner injected, so they stay in src/commands/run.test.ts.

import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AggregationResult, ContainerRunRecord } from "../../src/run-data-store.ts";
import { linkThunderjar } from "../../src/testing/fixture-project.ts";

const here = import.meta.dir;
const fixtures = join(here, "fixtures");
const cli = resolve(here, "..", "..", "src", "cli", "index.ts");

const ULID = /^[0-9a-hjkmnp-tv-z]{26}$/;

/** Makes `thunderjar` resolvable from fixtures/, so it can be run there by hand too. */
async function linkInPlace() {
  const link = join(here, "node_modules", "thunderjar");
  if (existsSync(link)) return;
  await mkdir(join(here, "node_modules"), { recursive: true });
  await symlink(resolve(here, "..", ".."), link, "dir");
}

/** A copy of fixtures/, without anything a manual run left behind, for a real run to write to. */
async function copyOfFixtures() {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-run-"));
  await cp(fixtures, dir, {
    recursive: true,
    filter: (src) => !/[/\\]\.thunderjar[/\\](\.data|_generated)$/.test(src),
  });
  await linkThunderjar(dir);
  return dir;
}

async function thunderjar(cwd: string, args: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(["bun", cli, ...args], { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

const executionIdOf = (stdout: string) => /^Execution (\S+) /.exec(stdout)![1]!;

/** The output with its execution ID, $TMPDIR and durations replaced by placeholders. */
const normalise = (stdout: string, tmpDir?: string) => {
  const id = executionIdOf(stdout);
  expect(id).toMatch(ULID);
  let text = stdout.replaceAll(id, "<id>").replace(/ exit (\d+) {2}\d+\.\d\ds$/gm, " exit $1  <t>s");
  if (tmpDir) text = text.replaceAll(tmpDir, "$TMPDIR");
  return text;
};

/** The top level of `dir` and everything under `.thunderjar/`, so a test can show nothing was written. */
const listTree = (dir: string) => [
  ...readdirSync(dir),
  ...readdirSync(join(dir, ".thunderjar"), { recursive: true }).map(String),
].toSorted();

// --- Dry runs, in fixtures/ itself ---

test("run two-pairs --dry-run: each permutation's prerun image, then each iteration's postrun image and harness command", async () => {
  await linkInPlace();
  const before = listTree(fixtures);

  const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["run", "two-pairs", "--dry-run"]);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  // The prerun hashes are those `thunderjar plan two-pairs` shows.
  expect(normalise(stdout)).toBe(`Execution <id> (dry run, 2 permutations × 2 iterations)

Permutation 1/2  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5 | terse
  prerun-h4fcb1a62
  iteration 1/2  postrun-e<id>-h4fcb1a62-i00
    claude -p "isPrime.ts: export a primality test." --model claude-haiku-4-5-20251001 > /thunderjar/result.json
  iteration 2/2  postrun-e<id>-h4fcb1a62-i01
    claude -p "isPrime.ts: export a primality test." --model claude-haiku-4-5-20251001 > /thunderjar/result.json

Permutation 2/2  node20 | baseline | snerk | codex@0.9.0/gpt-luna          | terse
  prerun-he8af79ce
  iteration 1/2  postrun-e<id>-he8af79ce-i00
    codex exec "isPrime.ts: export a primality test." --model gpt-luna > /thunderjar/result.json
  iteration 2/2  postrun-e<id>-he8af79ce-i01
    codex exec "isPrime.ts: export a primality test." --model gpt-luna > /thunderjar/result.json
`);
  // A dry run writes nothing.
  expect(listTree(fixtures)).toEqual(before);
});

test("run override --dry-run: the selected version's cli override, every line of it indented", async () => {
  await linkInPlace();
  const { stdout, exitCode } = await thunderjar(fixtures, ["run", "override", "--dry-run"]);
  expect(exitCode).toBe(0);
  expect(normalise(stdout)).toBe(`Execution <id> (dry run, 1 permutation × 1 iteration)

Permutation 1/1  node20 | baseline | snerk | claude-code@2.2.0/sonnet-5-5 | terse
  prerun-h88b45502
  iteration 1/1  postrun-e<id>-h88b45502-i00
    cd /workspace
    claude@2.2.0 -p "isPrime.ts: export a primality test." --model claude-sonnet-5-5 > /thunderjar/result.json
`);
});

test("run is-prime-baseline --dry-run: permutations in plan's order, with every iteration inside each", async () => {
  await linkInPlace();
  const { stdout } = await thunderjar(fixtures, ["run", "is-prime-baseline", "--dry-run"]);
  const plan = await thunderjar(fixtures, ["plan", "is-prime-baseline"]);
  const output = normalise(stdout);
  const lines = output.split("\n");

  expect(lines[0]).toBe("Execution <id> (dry run, 8 permutations × 5 iterations)");
  expect(output.match(/prerun-h[0-9a-f]{8}/g)).toEqual(plan.stdout.match(/prerun-h[0-9a-f]{8}/g));
  expect(lines.filter((line) => line.startsWith("Permutation ")).map((line) => line.split("  ")[0])).toEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Permutation ${n}/8`),
  );
  const iterationLines = lines.filter((line) => line.startsWith("  iteration "));
  expect(iterationLines).toHaveLength(40);
  iterationLines.forEach((line, i) => {
    expect(line).toMatch(new RegExp(`^  iteration ${(i % 5) + 1}/5  postrun-e<id>-h[0-9a-f]{8}-i0${i % 5}$`));
  });
});

test("each invocation gets its own execution ID", async () => {
  await linkInPlace();
  const first = await thunderjar(fixtures, ["run", "two-pairs", "--dry-run"]);
  const second = await thunderjar(fixtures, ["run", "two-pairs", "--dry-run"]);
  expect(executionIdOf(first.stdout)).not.toBe(executionIdOf(second.stdout));
});

test("prints usage for a missing test case name or an unknown flag", async () => {
  await linkInPlace();
  for (const args of [["run"], ["run", "--dry-run"], ["run", "two-pairs", "--dry-run", "--json"]]) {
    const { stderr, exitCode } = await thunderjar(fixtures, args);
    expect(stderr).toBe("usage: thunderjar run <test case> [--dry-run]\n");
    expect(exitCode).toBe(1);
  }
});

test("reports an unknown test case as a configuration error", async () => {
  await linkInPlace();
  const { stderr, exitCode } = await thunderjar(fixtures, ["run", "no-such-test-case", "--dry-run"]);
  expect(stderr).toContain(`no test case named "no-such-test-case"`);
  expect(exitCode).toBe(1);
});

// --- Real runs with the fake agent, on a copy of fixtures/ ---

/** Runs `testCase` for real in a copy of fixtures/, with container runs kept under a fresh $TMPDIR. */
async function runForReal(testCase: string) {
  const dir = await copyOfFixtures();
  const tmpDir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-tmp-"));
  const before = listTree(dir);
  const { stdout, stderr, exitCode } = await thunderjar(dir, ["run", testCase], { TMPDIR: tmpDir });
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const executionDir = join(tmpDir, "thunderjar", executionIdOf(stdout));
  const store = JSON.parse(readFileSync(join(dir, ".thunderjar", ".data", "runs.json"), "utf8")) as {
    containerRuns: ContainerRunRecord[];
    aggregationResults?: AggregationResult[];
  };
  // Only the run data store is written in the project.
  expect(listTree(dir)).toEqual([...before, ".data", join(".data", "runs.json")].toSorted());
  // Every scratch copy measured in was discarded.
  expect(readdirSync(tmpDir).filter((name) => name.startsWith("thunderjar-measure-"))).toEqual([]);
  return { output: normalise(stdout, tmpDir), executionDir, store };
}

/** The host's stand-in for one postrun image: what the agent left, its result and run.json. */
const containerRun = (executionDir: string, tag: string) => {
  const dir = join(executionDir, tag);
  const read = (rel: string) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : undefined);
  return {
    workspace: readdirSync(join(dir, "workspace")).toSorted(),
    isPrime: read("workspace/isPrime.ts"),
    result: read("thunderjar/result.json"),
    run: JSON.parse(read("thunderjar/run.json")!) as { startedAt: number; finishedAt: number; exitCode: number },
  };
};

const FAKE_MEASURES = `    isPrimeTemplateTest  {passed: 4, failed: 1}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1`;

test("run fake-is-prime: runs each container run, leaving the agent's files, its result and run.json, and measures it", async () => {
  const { output, executionDir, store } = await runForReal("fake-is-prime");

  expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/1  node20 | baseline | snerk | fake-agent@1.0.0/fake | plain
  iteration 1/2  postrun-e<id>-h573db649-i00  exit 0  <t>s
${FAKE_MEASURES}
  iteration 2/2  postrun-e<id>-h573db649-i01  exit 0  <t>s
${FAKE_MEASURES}

2 container runs: 2 exited 0
Recorded in .thunderjar/.data/runs.json
`);

  const tags = readdirSync(executionDir).toSorted();
  expect(tags).toHaveLength(2);
  for (const tag of tags) {
    const { workspace, isPrime, result, run } = containerRun(executionDir, tag);
    // Only what the agent left: no test rendered while measuring.
    expect(workspace).toEqual(["isPrime.ts"]);
    expect(isPrime).toBe(`// Create a file isPrime.ts exporting a function that tests for primality.
export function isPrime(n: number): boolean {
  // @ts-ignore
  if (n < 1) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
`);
    expect(result).toBe(`{"model":"fake-model"}\n`);
    expect(run.exitCode).toBe(0);
    expect(run.finishedAt).toBeGreaterThanOrEqual(run.startedAt);
  }

  // Each container run is recorded with its execution as in its run.json, and every measure.
  expect(store.containerRuns.map((r) => r.postrunImage)).toEqual(tags);
  store.containerRuns.forEach((record, iteration) => {
    expect(record.testCase).toBe("fake-is-prime");
    expect(record.iteration).toBe(iteration);
    expect(record.harnessModel).toEqual({ family: "fake-agent", version: "1.0.0", modelId: "fake-model" });
    expect(record.execution).toEqual(containerRun(executionDir, record.postrunImage).run);
    expect(Object.fromEntries(Object.entries(record.result).map(([name, measure]) => [name, measure.outcome]))).toEqual({
      isPrimeTemplateTest: { outcome: "measured", data: { passed: 4, failed: 1 } },
      isPrimeTsExists: { outcome: "measured", data: true },
      readmeExists: { outcome: "measured", data: false },
      tsIgnoreCount: { outcome: "measured", data: 1 },
    });
  });

  // And the permutation's aggregation result beside them.
  expect(store.aggregationResults!.map(({ iterations, measures }) => ({ iterations, measures }))).toEqual([
    {
      iterations: 2,
      measures: {
        isPrimeTemplateTest: { measured: 2, sum: { passed: 8, failed: 2 } },
        isPrimeTsExists: { measured: 2, rate: 1 },
        readmeExists: { measured: 2, rate: 0 },
        tsIgnoreCount: { measured: 2, mean: 1, max: 1 },
      },
    },
  ]);
});

test("run fake-fails: a failing cli's exit code is recorded, its runs are still measured, and the rest still run", async () => {
  const { output, executionDir, store } = await runForReal("fake-fails");

  // fake-agent@1.0.1 leaves a README.md and exits 3: nothing to test or count.
  expect(output).toBe(`Execution <id> (2 permutations × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/2  node20 | baseline | snerk | fake-agent@1.0.1/fake | plain
  iteration 1/2  postrun-e<id>-he6536e2b-i00  exit 3  <t>s
    isPrimeTemplateTest  skipped
    isPrimeTsExists      false
    readmeExists         true
    tsIgnoreCount        skipped
  iteration 2/2  postrun-e<id>-he6536e2b-i01  exit 3  <t>s
    isPrimeTemplateTest  skipped
    isPrimeTsExists      false
    readmeExists         true
    tsIgnoreCount        skipped

Permutation 2/2  node20 | baseline | snerk | fake-agent@1.0.0/fake | plain
  iteration 1/2  postrun-e<id>-h573db649-i00  exit 0  <t>s
${FAKE_MEASURES}
  iteration 2/2  postrun-e<id>-h573db649-i01  exit 0  <t>s
${FAKE_MEASURES}

4 container runs: 2 exited 0, 2 exited 3
Recorded in .thunderjar/.data/runs.json
`);

  const workspaces = readdirSync(executionDir).toSorted().map((tag) => containerRun(executionDir, tag).workspace);
  expect(workspaces.toSorted()).toEqual([["README.md"], ["README.md"], ["isPrime.ts"], ["isPrime.ts"]]);
  expect(store.containerRuns.map((r) => [r.harnessModel.version, r.execution.exitCode])).toEqual([
    ["1.0.1", 3],
    ["1.0.1", 3],
    ["1.0.0", 0],
    ["1.0.0", 0],
  ]);
});

test("run fake-without-measurements: a task without measurements prints and records none, but still aggregates durations", async () => {
  const { output, store } = await runForReal("fake-without-measurements");

  expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/1  node20 | baseline | snerk | fake-agent@1.0.0/fake | impatient
  iteration 1/2  postrun-e<id>-h4acded70-i00  exit 0  <t>s
  iteration 2/2  postrun-e<id>-h4acded70-i01  exit 0  <t>s

2 container runs: 2 exited 0
Recorded in .thunderjar/.data/runs.json
`);
  for (const { result } of store.containerRuns) expect(result).toEqual({});
  expect(store.aggregationResults!.map(({ iterations, measures }) => ({ iterations, measures }))).toEqual([
    { iterations: 2, measures: {} },
  ]);
});

test("run fake-times-out: a cli that runs past the initial prompt's timeoutSeconds is killed, with exit code 124", async () => {
  const startedAt = Date.now();
  const { output, executionDir } = await runForReal("fake-times-out");
  // Each of the two iterations is killed at about a second, well before `sleep 2` ends.
  expect(Date.now() - startedAt).toBeLessThan(3500);

  expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/1  node20 | baseline | snerk | fake-agent@1.0.2/fake | impatient
  iteration 1/2  postrun-e<id>-hc7a033f7-i00  exit 124  <t>s
  iteration 2/2  postrun-e<id>-hc7a033f7-i01  exit 124  <t>s

2 container runs: 2 exited 124
Recorded in .thunderjar/.data/runs.json
`);

  await Bun.sleep(1500); // past when `sleep 2` would have finished
  for (const tag of readdirSync(executionDir)) {
    const { workspace, run } = containerRun(executionDir, tag);
    expect(workspace).toEqual(["started.txt"]);
    expect(run.exitCode).toBe(124);
    expect(run.finishedAt - run.startedAt).toBeGreaterThanOrEqual(1000);
    expect(run.finishedAt - run.startedAt).toBeLessThan(1900);
  }
});
