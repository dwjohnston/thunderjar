// `thunderjar run` in a typical project: two fake harnesses that behave, one with a version
// that overrides its cli, a task with measurements and one without. By hand:
//
//   bun run fixture scenario_2 run two-pairs --dry-run
//   bun run fixture scenario_2 run two-pairs

import { expect, test } from "bun:test";
import {
  containerRun,
  executionIdOf,
  listTree,
  normalise,
  runForReal,
  scenarioFixtures,
  tagsIn,
  thunderjar,
} from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

const ALPHA_CLI = (prompt: string, model: string) =>
  `printf '%s\\n' '// ${prompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"${model}"}' > /thunderjar/result.json`;
const BETA_CLI = (prompt: string, model: string) =>
  `printf '%s\\n' '// ${prompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts && echo '{"model":"${model}"}' > /thunderjar/result.json`;

const TERSE = "isPrime.ts: export a primality test.";
const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";

// What each harness's isPrime.ts measures as: alpha's is buggy (2 isn't prime, 15 is) with a @ts-ignore.
const ALPHA_MEASURES = `    isPrimeTemplateTest  {passed: 3, failed: 2}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1`;
const BETA_MEASURES = `    isPrimeTemplateTest  {passed: 5, failed: 0}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        0`;

// --- Dry runs ---

test("run two-pairs --dry-run: each permutation's prerun image, then each iteration's postrun image and harness command", async () => {
  const before = listTree(fixtures);

  const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["run", "two-pairs", "--dry-run"]);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  // The prerun hashes are those `thunderjar plan two-pairs` shows.
  expect(normalise(stdout)).toBe(`Execution <id> (dry run, 2 permutations × 2 iterations)

Permutation 1/2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
  prerun-h59a96fed
  iteration 1/2  postrun-e<id>-h59a96fed-i00
    ${ALPHA_CLI(TERSE, "fake-model-small-001")}
  iteration 2/2  postrun-e<id>-h59a96fed-i01
    ${ALPHA_CLI(TERSE, "fake-model-small-001")}

Permutation 2/2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
  prerun-h7b38cbd7
  iteration 1/2  postrun-e<id>-h7b38cbd7-i00
    ${BETA_CLI(TERSE, "fake-model-large-001")}
  iteration 2/2  postrun-e<id>-h7b38cbd7-i01
    ${BETA_CLI(TERSE, "fake-model-large-001")}
`);
  // A dry run writes nothing.
  expect(listTree(fixtures)).toEqual(before);
});

test("run version-cli-override --dry-run: the selected version's cli override, every line of it indented", async () => {
  const { stdout, exitCode } = await thunderjar(fixtures, ["run", "version-cli-override", "--dry-run"]);
  expect(exitCode).toBe(0);
  expect(normalise(stdout)).toBe(`Execution <id> (dry run, 1 permutation × 1 iteration)

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.1.0/fake-model-large | terse
  prerun-h6395ea06
  iteration 1/1  postrun-e<id>-h6395ea06-i00
    echo "fake-harness-alpha@1.1.0" > version.txt
    ${ALPHA_CLI(TERSE, "fake-model-large-001")}
`);
});

test("run is-prime-baseline --dry-run: permutations in plan's order, with every iteration inside each", async () => {
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
  const first = await thunderjar(fixtures, ["run", "two-pairs", "--dry-run"]);
  const second = await thunderjar(fixtures, ["run", "two-pairs", "--dry-run"]);
  expect(executionIdOf(first.stdout)).not.toBe(executionIdOf(second.stdout));
});

test("prints usage for a missing test case name or an unknown flag", async () => {
  for (const args of [["run"], ["run", "--dry-run"], ["run", "two-pairs", "--dry-run", "--json"]]) {
    const { stderr, exitCode } = await thunderjar(fixtures, args);
    expect(stderr).toBe("usage: thunderjar run <test case> [--dry-run]\n");
    expect(exitCode).toBe(1);
  }
});

test("reports an unknown test case as a configuration error", async () => {
  const { stderr, exitCode } = await thunderjar(fixtures, ["run", "no-such-test-case", "--dry-run"]);
  expect(stderr).toContain(`no test case named "no-such-test-case"`);
  expect(exitCode).toBe(1);
});

// --- Real runs ---

test("run two-pairs: each harness leaves its own isPrime.ts, measured differently", async () => {
  const { output, executionDir } = await runForReal(fixtures, "two-pairs");

  expect(output).toBe(`Execution <id> (2 permutations × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
  iteration 1/2  postrun-e<id>-h59a96fed-i00  exit 0  <t>s
${ALPHA_MEASURES}
  iteration 2/2  postrun-e<id>-h59a96fed-i01  exit 0  <t>s
${ALPHA_MEASURES}

Permutation 2/2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
  iteration 1/2  postrun-e<id>-h7b38cbd7-i00  exit 0  <t>s
${BETA_MEASURES}
  iteration 2/2  postrun-e<id>-h7b38cbd7-i01  exit 0  <t>s
${BETA_MEASURES}

4 container runs: 4 exited 0
Recorded in .thunderjar/.data/runs.json
`);
  const results = tagsIn(executionDir).map((tag) => containerRun(executionDir, tag).result);
  expect(results.toSorted()).toEqual([
    `{"model":"fake-model-large-001"}\n`,
    `{"model":"fake-model-large-001"}\n`,
    `{"model":"fake-model-small-001"}\n`,
    `{"model":"fake-model-small-001"}\n`,
  ]);
});

test("run version-cli-override: runs every line of the overriding cli", async () => {
  const { executionDir } = await runForReal(fixtures, "version-cli-override");
  const [tag] = tagsIn(executionDir);
  const { workspace, read } = containerRun(executionDir, tag!);
  expect(workspace).toEqual(["isPrime.ts", "version.txt"]);
  expect(read("version.txt")).toBe("fake-harness-alpha@1.1.0\n");
});

test("run alpha-is-prime: leaves the agent's files, its result and run.json, and records and aggregates every measure", async () => {
  const { output, executionDir, store } = await runForReal(fixtures, "alpha-is-prime");

  expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  iteration 1/2  postrun-e<id>-hd3d9e0f3-i00  exit 0  <t>s
${ALPHA_MEASURES}
  iteration 2/2  postrun-e<id>-hd3d9e0f3-i01  exit 0  <t>s
${ALPHA_MEASURES}

2 container runs: 2 exited 0
Recorded in .thunderjar/.data/runs.json
`);

  const tags = tagsIn(executionDir);
  for (const tag of tags) {
    const { workspace, read, result, run } = containerRun(executionDir, tag);
    // Only what the agent left: no test rendered while measuring.
    expect(workspace).toEqual(["isPrime.ts"]);
    expect(read("isPrime.ts")).toBe(`// ${PLAIN}
// @ts-ignore
export const isPrime = (n: number) => n > 1 && n % 2 !== 0;
`);
    expect(result).toBe(`{"model":"fake-model-small-001"}\n`);
    expect(run.exitCode).toBe(0);
    expect(run.finishedAt).toBeGreaterThanOrEqual(run.startedAt);
  }

  // Each container run is recorded with its execution as in its run.json, and every measure.
  expect(store.containerRuns.map((r) => r.postrunImage)).toEqual(tags);
  store.containerRuns.forEach((record, iteration) => {
    expect(record.testCase).toBe("alpha-is-prime");
    expect(record.iteration).toBe(iteration);
    expect(record.harnessModel).toEqual({ family: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" });
    expect(record.execution).toEqual(containerRun(executionDir, record.postrunImage).run);
    expect(Object.fromEntries(Object.entries(record.result).map(([name, measure]) => [name, measure.outcome]))).toEqual({
      isPrimeTemplateTest: { outcome: "measured", data: { passed: 3, failed: 2 } },
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
        isPrimeTemplateTest: { measured: 2, sum: { passed: 6, failed: 4 } },
        isPrimeTsExists: { measured: 2, rate: 1 },
        readmeExists: { measured: 2, rate: 0 },
        tsIgnoreCount: { measured: 2, mean: 1, max: 1 },
      },
    },
  ]);
});

test("run without-measurements: a task without measurements prints and records none, but still aggregates durations", async () => {
  const { output, store } = await runForReal(fixtures, "without-measurements");

  expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  iteration 1/2  postrun-e<id>-hb3bd98e8-i00  exit 0  <t>s
  iteration 2/2  postrun-e<id>-hb3bd98e8-i01  exit 0  <t>s

2 container runs: 2 exited 0
Recorded in .thunderjar/.data/runs.json
`);
  for (const { result } of store.containerRuns) expect(result).toEqual({});
  expect(store.aggregationResults!.map(({ iterations, measures }) => ({ iterations, measures }))).toEqual([
    { iterations: 2, measures: {} },
  ]);
});
