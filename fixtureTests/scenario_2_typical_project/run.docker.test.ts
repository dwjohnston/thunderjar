// `thunderjar run` in a typical project, for real: each prerun image is built, then each
// iteration runs in a container from it, leaving a postrun image. Docker is real; the agents are
// the fake ones. Skipped by `bun test`; run with `bun run test:prepare && bun run test:docker`.
// Each run tags its images under a throwaway prefix, removed afterwards. By hand:
//
//   bun run fixture scenario_2 run two-pairs

import { afterAll, describe, expect, test } from "bun:test";
import { containerRun, removeTestImages, runForReal, scenarioFixtures, tagsIn } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

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

describe.skipIf(!process.env.THUNDERJAR_TEST_DOCKER)("run, against real Docker", () => {
  afterAll(removeTestImages);

  test("run two-pairs: builds each prerun image, then each harness leaves its own isPrime.ts, measured differently", async () => {
    const { output, prefix, store, images } = await runForReal(fixtures, "two-pairs");

    expect(output).toBe(`Execution <id> (2 permutations × 2 iterations)
Images in <prefix>
Build contexts in $TMPDIR/thunderjar/builds

Permutation 1/2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
  prerun-hefe85dda  built (<t>s)
  iteration 1/2  postrun-e<id>-hefe85dda-i00  exit 0  <t>s
${ALPHA_MEASURES}
  iteration 2/2  postrun-e<id>-hefe85dda-i01  exit 0  <t>s
${ALPHA_MEASURES}

Permutation 2/2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
  prerun-h56ea4852  built (<t>s)
  iteration 1/2  postrun-e<id>-h56ea4852-i00  exit 0  <t>s
${BETA_MEASURES}
  iteration 2/2  postrun-e<id>-h56ea4852-i01  exit 0  <t>s
${BETA_MEASURES}

4 container runs: 4 exited 0
Recorded in .thunderjar/.data/runs.json
`);
    // Both prerun images, and a postrun image for each container run, under the prefix.
    const tags = tagsIn(store);
    expect(images).toEqual(
      [`${prefix}:prerun-h56ea4852`, `${prefix}:prerun-hefe85dda`, ...tags.map((tag) => `${prefix}:${tag}`)].toSorted(),
    );
    expect(tags.map((tag) => containerRun(prefix, tag).result)).toEqual([
      `{"model":"fake-model-small-001"}\n`,
      `{"model":"fake-model-small-001"}\n`,
      `{"model":"fake-model-large-001"}\n`,
      `{"model":"fake-model-large-001"}\n`,
    ]);
  }, 300_000);

  test("run version-cli-override: runs every line of the overriding cli", async () => {
    const { prefix, store } = await runForReal(fixtures, "version-cli-override");
    const [tag] = tagsIn(store);
    const { workspace, read } = containerRun(prefix, tag!);
    expect(workspace).toEqual(["isPrime.ts", "version.txt"]);
    expect(read("version.txt")).toBe("fake-harness-alpha@1.1.0\n");
  }, 300_000);

  test("run alpha-is-prime: leaves the agent's files, its result and run.json, and records and aggregates every measure", async () => {
    const { output, prefix, store } = await runForReal(fixtures, "alpha-is-prime");

    expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Images in <prefix>
Build contexts in $TMPDIR/thunderjar/builds

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  prerun-h8ffdda6e  built (<t>s)
  iteration 1/2  postrun-e<id>-h8ffdda6e-i00  exit 0  <t>s
${ALPHA_MEASURES}
  iteration 2/2  postrun-e<id>-h8ffdda6e-i01  exit 0  <t>s
${ALPHA_MEASURES}

2 container runs: 2 exited 0
Recorded in .thunderjar/.data/runs.json
`);

    const tags = tagsIn(store);
    for (const tag of tags) {
      const { workspace, read, result, run } = containerRun(prefix, tag);
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
    store.containerRuns.forEach((record, iteration) => {
      expect(record.testCase).toBe("alpha-is-prime");
      expect(record.iteration).toBe(iteration);
      expect(record.harnessModel).toEqual({ family: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" });
      expect(record.execution).toEqual(containerRun(prefix, record.postrunImage).run);
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
  }, 300_000);

  test("run without-measurements: a task without measurements prints and records none, but still aggregates durations", async () => {
    const { output, store } = await runForReal(fixtures, "without-measurements");

    expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Images in <prefix>
Build contexts in $TMPDIR/thunderjar/builds

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  prerun-h7b7bc614  built (<t>s)
  iteration 1/2  postrun-e<id>-h7b7bc614-i00  exit 0  <t>s
  iteration 2/2  postrun-e<id>-h7b7bc614-i01  exit 0  <t>s

2 container runs: 2 exited 0
Recorded in .thunderjar/.data/runs.json
`);
    for (const { result } of store.containerRuns) expect(result).toEqual({});
    expect(store.aggregationResults!.map(({ iterations, measures }) => ({ iterations, measures }))).toEqual([
      { iterations: 2, measures: {} },
    ]);
  }, 300_000);
});
