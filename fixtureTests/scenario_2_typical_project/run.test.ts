// `thunderjar run` in a typical project: two fake harnesses that behave, one with a version
// that overrides its cli, a task with measurements and one without. By hand:
//
//   bun run fixture scenario_2 run two-pairs --dry-run
//
// Its real runs, against real Docker, are in run.docker.test.ts.

import { expect, test } from "bun:test";
import { executionIdOf, listTree, normalise, scenarioFixtures, thunderjar } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

const ALPHA_CLI = (prompt: string, model: string) =>
  `printf '%s\\n' '// ${prompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"${model}"}' > /thunderjar/result.json`;
const BETA_CLI = (prompt: string, model: string) =>
  `printf '%s\\n' '// ${prompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts && echo '{"model":"${model}"}' > /thunderjar/result.json`;

const TERSE = "isPrime.ts: export a primality test.";

// --- Dry runs ---

test("run two-pairs --dry-run: each permutation's prerun image, then each iteration's postrun image and harness command", async () => {
  const before = listTree(fixtures);

  const { stdout, stderr, exitCode } = await thunderjar(fixtures, ["run", "two-pairs", "--dry-run"]);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  // The prerun hashes are those `thunderjar plan two-pairs` shows.
  expect(normalise(stdout)).toBe(`Execution <id> (dry run, 2 permutations × 2 iterations)

Permutation 1/2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
  prerun-hefe85dda (will build)
  iteration 1/2  postrun-e<id>-hefe85dda-i00
    ${ALPHA_CLI(TERSE, "fake-model-small-001")}
  iteration 2/2  postrun-e<id>-hefe85dda-i01
    ${ALPHA_CLI(TERSE, "fake-model-small-001")}

Permutation 2/2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
  prerun-h56ea4852 (will build)
  iteration 1/2  postrun-e<id>-h56ea4852-i00
    ${BETA_CLI(TERSE, "fake-model-large-001")}
  iteration 2/2  postrun-e<id>-h56ea4852-i01
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
  prerun-h1fef9cf7 (will build)
  iteration 1/1  postrun-e<id>-h1fef9cf7-i00
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
    expect(stderr).toBe("usage: thunderjar run <test case> [--dry-run] [--image-prefix <name>] [--data-dir <dir>]\n");
    expect(exitCode).toBe(1);
  }
});

test("reports an unknown test case as a configuration error", async () => {
  const { stderr, exitCode } = await thunderjar(fixtures, ["run", "no-such-test-case", "--dry-run"]);
  expect(stderr).toContain(`no test case named "no-such-test-case"`);
  expect(exitCode).toBe(1);
});
