import { describe, expect, test } from "bun:test";
import type { MeasurementDeclaration, Stat } from "../api/declarations.ts";
import type { ContainerRunRecord, RecordedOutcome } from "../store/runDataStore.ts";
import { loadMeasurements } from "../config/measurements.ts";
import { scenario } from "../testing/scenario.ts";
import { type AggregatedMetric, aggregatePermutation, combine, scoreOf } from "./aggregate.ts";

describe("combine", () => {
  test("booleans, as 1 and 0: rate is the fraction true, count the number true", () => {
    expect(combine("rate", [1, 0, 1, 1])).toBe(0.75);
    expect(combine("count", [1, 0, 1, 1])).toBe(3);
  });

  test("numbers: mean, median, min, max and sum", () => {
    const xs = [3, 1, 2, 10];
    expect(["mean", "median", "min", "max", "sum"].map((stat) => combine(stat as never, xs))).toEqual([4, 2.5, 1, 10, 16]);
    expect(combine("median", [5, 1, 3])).toBe(3);
  });

  test("no scores combine to undefined, never 0", () => {
    expect(combine("count", [])).toBeUndefined();
    expect(combine("sum", [])).toBeUndefined();
  });
});

describe("scoreOf", () => {
  const SHELL = { exitCode: 0, stdout: '{"lines":3}\n', stdoutTruncated: false };

  test("without a score of its own, a metric reads the instrument's default score", () => {
    expect(scoreOf("shell", { stat: "rate" }, SHELL)).toEqual({ score: true });
    expect(scoreOf("shell", { stat: "rate" }, { ...SHELL, exitCode: 1 })).toEqual({ score: false });
    expect(scoreOf("bunTestFile", { stat: "mean" }, { passed: 3, total: 4 })).toEqual({ score: 0.75 });
    expect(scoreOf("grep", { stat: "max" }, 2)).toEqual({ score: 2 });
  });

  test("a score of its own reads the value", () => {
    const lines = (v: typeof SHELL) => (JSON.parse(v.stdout) as { lines: number }).lines;
    expect(scoreOf("shell", { stat: "median", score: lines as never }, SHELL)).toEqual({ score: 3 });
  });

  test("undefined doesn't apply", () => {
    expect(scoreOf("bunTestFile", { stat: "mean" }, { passed: 0, total: 0 })).toEqual({ notApplicable: true });
  });

  test("a score that throws, or isn't a number or boolean of the kind its stat combines, fails, with why", () => {
    const score = (f: (v: never) => unknown) => ({ stat: "mean" as const, score: f });
    expect(scoreOf("shell", score((v: typeof SHELL) => JSON.parse(v.stdout.slice(1))), SHELL)).toEqual({
      failed: expect.stringMatching(/^score threw: /),
    });
    expect(scoreOf("shell", score((v: typeof SHELL) => v.stdout), SHELL)).toEqual({ failed: 'score returned "{\\"lines\\":3}\\n", not a number, which "mean" combines' });
    expect(scoreOf("shell", score(() => true), SHELL)).toEqual({ failed: 'score returned true, not a number, which "mean" combines' });
    expect(scoreOf("shell", { stat: "rate", score: () => 1 }, SHELL)).toEqual({ failed: 'score returned 1, not a boolean, which "rate" combines' });
    expect(scoreOf("shell", score(() => Number("x")), SHELL)).toEqual({ failed: "score returned NaN" });
  });
});

/** The content hash of every measurement here, and of what they recorded, unless stale. */
const HASH = "c";

const measured = (data: unknown): RecordedOutcome => ({ outcome: "measured", data });

/** A container run of permutation 1, iteration `iteration`, with an outcome per measure. */
function run(iteration: number, outcomes: Record<string, RecordedOutcome>): ContainerRunRecord {
  const parameter = { name: "x", parameterHash: "h" };
  return {
    executionId: "e",
    testCase: "t",
    task: "is-prime",
    permutation: 1,
    permutationHash: "p",
    iteration,
    postrunImage: `thunderjar-postrun:e-1-${iteration}`,
    ranAt: "2026-10-01T10:00:00.000Z",
    parameters: { baseImage: parameter, codeState: parameter, promptSet: parameter, harnessModel: parameter, initialPrompt: parameter },
    harnessModel: { harness: "fake-harness-alpha", version: "1.0.0", model: "m", modelId: "m-1" },
    execution: { startedAt: 0, finishedAt: 1000, exitCode: 0 },
    harnessResult: null,
    result: Object.fromEntries(
      Object.entries(outcomes).map(([name, outcome]) => [name, { instrument: "grep", contentHash: HASH, measuredAt: "2026-10-01T10:00:01.000Z", outcome }]),
    ),
  };
}

const measurement = (name: string, declaration: MeasurementDeclaration) => ({ name, declaration, contentHash: HASH });
const EXISTS = measurement("exists", { instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, metrics: { exists: { stat: "rate" } } });
const IGNORES = measurement("ignores", {
  instrument: "grep",
  config: { glob: "**/*.ts", pattern: "@ts-ignore" },
  metrics: { mean: { stat: "mean", better: "lower" }, most: { stat: "max" } },
});
const TESTS = measurement("tests", {
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: { passRate: { stat: "mean" }, passed: { stat: "sum", score: ((v: { passed: number }) => v.passed) as never } },
});

/** An aggregated metric, with nothing left out unless given. */
const metric = (stat: Stat, value: number | undefined, applicable: number, rest: Partial<AggregatedMetric> = {}): AggregatedMetric => ({
  kind: stat === "rate" || stat === "count" ? "boolean" : "number",
  stat,
  value,
  applicable,
  notApplicable: 0,
  failed: [],
  ...rest,
});

describe("aggregatePermutation", () => {
  test("reads each measurement's measures by each of its metrics, and combines them, in the order declared", () => {
    const runs = [run(1, { exists: measured(true), ignores: measured(1) }), run(2, { exists: measured(false), ignores: measured(3) })];

    const { measures, leftOut } = aggregatePermutation(runs, [IGNORES, EXISTS]);

    expect(measures).toEqual({
      ignores: { measured: 2, metrics: { mean: metric("mean", 2, 2, { better: "lower" }), most: metric("max", 3, 2) } },
      exists: { measured: 2, metrics: { exists: metric("rate", 0.5, 2) } },
    });
    expect(Object.keys(measures)).toEqual(["ignores", "exists"]);
    expect(leftOut).toEqual([]);
  });

  test("leaves out an iteration that was skipped, errored while measuring, never measured, or measured by an earlier measurement", () => {
    const stale = run(6, { ignores: measured(9) });
    stale.result.ignores!.contentHash = "earlier";
    const runs = [
      run(1, { ignores: measured(2) }),
      run(2, { ignores: { outcome: "skipped", reason: "no file matches **/*.ts" } }),
      run(3, { ignores: { outcome: "erroredWhileMeasuring", error: { message: "boom" } } }),
      run(4, {}),
      run(5, { ignores: measured(4) }),
      stale,
    ];

    const { measures, leftOut } = aggregatePermutation(runs, [IGNORES]);

    expect(measures.ignores).toEqual({ measured: 2, metrics: { mean: metric("mean", 3, 2, { better: "lower" }), most: metric("max", 4, 2) } });
    expect(leftOut).toEqual([
      { iteration: 2, measurement: "ignores", why: "skipped", reason: "no file matches **/*.ts" },
      { iteration: 3, measurement: "ignores", why: "erroredWhileMeasuring", reason: "boom" },
      { iteration: 4, measurement: "ignores", why: "notMeasured" },
      { iteration: 6, measurement: "ignores", why: "stale", reason: "measured before the measurement or its instrument changed" },
    ]);
  });

  test("leaves a score that doesn't apply, or fails, out of that metric only, and zero-fills nothing", () => {
    const runs = [run(1, { tests: measured({ passed: 3, total: 5 }) }), run(2, { tests: measured({ passed: 0, total: 0 }) }), run(3, { tests: measured(true) })];

    const { measures, leftOut } = aggregatePermutation(runs, [TESTS]);

    expect(measures.tests).toEqual({
      measured: 3,
      metrics: {
        passRate: metric("mean", 0.6, 1, { notApplicable: 1, failed: [{ iteration: 3, reason: "score returned NaN" }] }),
        passed: metric("sum", 3, 2, { notApplicable: 1 }),
      },
    });
    expect(leftOut).toEqual([
      { iteration: 2, measurement: "tests", metric: "passRate", why: "notApplicable" },
      { iteration: 3, measurement: "tests", metric: "passRate", why: "scoreFailed", reason: "score returned NaN" },
      { iteration: 3, measurement: "tests", metric: "passed", why: "notApplicable" },
    ]);
  });

  test("a metric no run has a score for has no value, not 0", () => {
    expect(aggregatePermutation([run(1, {})], [EXISTS]).measures).toEqual({ exists: { measured: 0, metrics: { exists: metric("rate", undefined, 0) } } });
  });

  test("ignores a recorded measure the task no longer declares", () => {
    expect(aggregatePermutation([run(1, { deleted: measured(true), exists: measured(true) })], [EXISTS]).measures).toEqual({
      exists: { measured: 1, metrics: { exists: metric("rate", 1, 1) } },
    });
  });

  test("a recorded value its metric's stat doesn't combine fails that metric, and the rest still combine", () => {
    const runs = [run(1, { exists: measured(2), ignores: measured(1) }), run(2, { exists: measured(0), ignores: measured(3) })];

    const { measures } = aggregatePermutation(runs, [EXISTS, IGNORES]);

    expect(measures.exists?.metrics.exists).toMatchObject({ value: undefined, applicable: 0, failed: [{ iteration: 1 }, { iteration: 2 }] });
    expect(measures.ignores?.metrics.most).toMatchObject({ value: 3, applicable: 2 });
  });

  test("0202's isPrimeTests: a run of no tests doesn't apply to passRate, and scores 0 for passed", async () => {
    const tests = (await loadMeasurements(`${scenario("0202")}/.thunderjar`, "is-prime")).filter(({ name }) => name === "isPrimeTests");
    const at = (iteration: number, data: unknown) => ({ ...run(iteration, {}), result: { isPrimeTests: { instrument: "bunTestFile", contentHash: tests[0]!.contentHash, measuredAt: "", outcome: measured(data) } } });

    const { measures, leftOut } = aggregatePermutation([at(1, { passed: 4, total: 5 }), at(2, { passed: 0, total: 0 })], tests);

    expect(measures.isPrimeTests?.metrics).toEqual({
      passRate: metric("mean", 0.8, 1, { better: "higher", notApplicable: 1 }),
      passed: metric("mean", 2, 2, { better: "higher" }),
    });
    expect(leftOut).toEqual([{ iteration: 2, measurement: "isPrimeTests", metric: "passRate", why: "notApplicable" }]);
  });
});
