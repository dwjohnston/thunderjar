import { expect, test } from "bun:test";
import { aggregateMeasure, aggregatePermutation } from "./aggregate.ts";
import type { ContainerRunRecord, RecordedOutcome, Result } from "../store/run-data-store.ts";

const EXECUTION = "01k4x9j2e8mqz3";
const PERMUTATION = "4f9a21c8e0b7".padEnd(64, "0");

/** A result with a measure per entry, each from `outcome`. */
const resultOf = (outcomes: Record<string, RecordedOutcome>): Result =>
  Object.fromEntries(
    Object.entries(outcomes).map(([name, outcome]) => [
      name,
      { instrument: "fileCreated", contentHash: "7b21ac90", measuredAt: "2026-09-29T14:31:02.000Z", outcome },
    ]),
  );

const measured = (data: unknown): RecordedOutcome => ({ outcome: "measured", data });
const skipped: RecordedOutcome = { outcome: "skipped", reason: "no file matches **/isPrime.ts" };
const errored: RecordedOutcome = { outcome: "erroredWhileMeasuring", error: { message: "disk on fire" } };

/** Iteration `iteration` of the permutation, its agent running for `seconds`. */
const iteration = (iteration: number, result: Result, seconds = 40): ContainerRunRecord => ({
  executionId: EXECUTION,
  testCase: "is-prime-baseline",
  task: "is-prime",
  permutationHash: PERMUTATION,
  iteration,
  postrunImage: `postrun-e${EXECUTION}-h4f9a21c8-i0${iteration}`,
  ranAt: "2026-09-29T14:30:55.000Z",
  parameters: {
    baseImage: { name: "node20", parameterHash: "a01f" },
    codeState: { name: "baseline", parameterHash: "b92c" },
    promptSet: { name: "snerk", parameterHash: "c7d4" },
    harnessModel: { name: "fake-harness-alpha@1.0.0/fake-model-small", parameterHash: "d5e1" },
    initialPrompt: { name: "plain", parameterHash: "f20b" },
  },
  harnessModel: { family: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" },
  result,
  execution: { startedAt: 1790692255000, finishedAt: 1790692255000 + seconds * 1000, exitCode: 0 },
});

const IS_PRIME_MEASUREMENTS = [
  { name: "isPrimeTsExists", aggregate: ["rate"] },
  { name: "tsIgnoreCount", aggregate: ["mean", "max"] },
  { name: "isPrimeTemplateTest", aggregate: ["sum"] },
] as const;

test("the spec's five-iteration is-prime example gives exactly the spec's aggregation result", () => {
  const isPrimeTsExists = [true, true, true, false, true];
  const tsIgnoreCount = [0, 2, 0, 0, 1];
  const isPrimeTemplateTest = [
    measured({ passed: 4, failed: 1 }),
    measured({ passed: 5, failed: 0 }),
    measured({ passed: 5, failed: 0 }),
    skipped, // i03: no isPrime.ts to test
    measured({ passed: 3, failed: 2 }),
  ];
  const seconds = [43, 51, 38, 40, 43];
  const records = seconds.map((s, i) =>
    iteration(
      i,
      resultOf({
        isPrimeTsExists: measured(isPrimeTsExists[i]),
        tsIgnoreCount: measured(tsIgnoreCount[i]),
        isPrimeTemplateTest: isPrimeTemplateTest[i]!,
      }),
      s,
    ),
  );

  expect(aggregatePermutation(records, IS_PRIME_MEASUREMENTS)).toEqual({
    executionId: EXECUTION,
    permutationHash: PERMUTATION,
    iterations: 5,
    measures: {
      isPrimeTsExists: { measured: 5, rate: 0.8 },
      tsIgnoreCount: { measured: 5, mean: 0.6, max: 2 },
      isPrimeTemplateTest: { measured: 4, sum: { passed: 17, failed: 3 } },
    },
    duration: { mean: 43000, max: 51000 },
  });
});

test("booleans combine by rate and count", () => {
  expect(aggregateMeasure([true, false, true, true], ["rate", "count"])).toEqual({ rate: 0.75, count: 3 });
  expect(aggregateMeasure([false, false], ["count", "rate"])).toEqual({ count: 0, rate: 0 });
});

test("numbers combine by mean, median, min, max and sum", () => {
  expect(aggregateMeasure([3, 1, 2], ["mean", "median", "min", "max", "sum"])).toEqual({
    mean: 2,
    median: 2,
    min: 1,
    max: 3,
    sum: 6,
  });
});

test("the median of an even count is the mean of the two middle values", () => {
  expect(aggregateMeasure([7, 1, 4, 2], ["median"])).toEqual({ median: 3 });
  expect(aggregateMeasure([0, 1], ["median"])).toEqual({ median: 0.5 });
});

test("records of numbers combine by sum and mean, key by key", () => {
  const values = [
    { passed: 4, failed: 1 },
    { passed: 5, failed: 0 },
  ];
  expect(aggregateMeasure(values, ["sum", "mean"])).toEqual({
    sum: { passed: 9, failed: 1 },
    mean: { passed: 4.5, failed: 0.5 },
  });
});

test("keys come in the order the methods were chosen", () => {
  expect(Object.keys(aggregateMeasure([1, 2], ["max", "mean"]))).toEqual(["max", "mean"]);
});

test("no values give no method keys", () => {
  expect(aggregateMeasure([] as number[], ["mean", "max"])).toEqual({});
});

test("a method the values' type doesn't have is a type error, and throws at runtime", () => {
  // @ts-expect-error -- rate is for booleans
  expect(() => aggregateMeasure([0, 2], ["rate"])).toThrow(`"rate" doesn't combine numbers`);
  // @ts-expect-error -- max is for numbers
  expect(() => aggregateMeasure([{ passed: 1, failed: 0 }], ["max"])).toThrow(`"max" doesn't combine records of numbers`);
  // @ts-expect-error -- mean is for numbers and records
  expect(() => aggregateMeasure([true], ["mean"])).toThrow(`"mean" doesn't combine booleans`);
});

test("values of mixed types throw", () => {
  expect(() => aggregateMeasure<unknown>([1, true], ["sum" as never])).toThrow("not all booleans, numbers or records of numbers");
});

test("skipped, errored and missing values are excluded, and measured counts the rest", () => {
  const records = [
    iteration(0, resultOf({ tsIgnoreCount: measured(4) })),
    iteration(1, resultOf({ tsIgnoreCount: skipped })),
    iteration(2, resultOf({ tsIgnoreCount: errored })),
    iteration(3, resultOf({})),
    iteration(4, resultOf({ tsIgnoreCount: measured(2) })),
  ];
  expect(aggregatePermutation(records, [{ name: "tsIgnoreCount", aggregate: ["mean", "max"] }]).measures).toEqual({
    tsIgnoreCount: { measured: 2, mean: 3, max: 4 },
  });
});

test("all iterations skipped gives { measured: 0 }, with no method keys", () => {
  const records = [0, 1].map((i) => iteration(i, resultOf({ isPrimeTemplateTest: skipped })));
  expect(aggregatePermutation(records, [{ name: "isPrimeTemplateTest", aggregate: ["sum"] }]).measures).toEqual({
    isPrimeTemplateTest: { measured: 0 },
  });
});

test("a stored measure with no current measurement is left out, and a declared one never measured is { measured: 0 }", () => {
  const records = [0, 1].map((i) =>
    iteration(i, resultOf({ isPrimeTsExists: measured(true), deletedMeasurement: measured(3) })),
  );
  expect(
    aggregatePermutation(records, [
      { name: "isPrimeTsExists", aggregate: ["rate"] },
      { name: "addedLater", aggregate: ["count"] },
    ]).measures,
  ).toEqual({
    isPrimeTsExists: { measured: 2, rate: 1 },
    addedLater: { measured: 0 },
  });
});

test("a single iteration is still an aggregation result", () => {
  const result = aggregatePermutation([iteration(0, resultOf({ tsIgnoreCount: measured(1) }), 0.04)], [
    { name: "tsIgnoreCount", aggregate: ["mean", "max"] },
  ]);
  expect(result).toEqual({
    executionId: EXECUTION,
    permutationHash: PERMUTATION,
    iterations: 1,
    measures: { tsIgnoreCount: { measured: 1, mean: 1, max: 1 } },
    duration: { mean: 40, max: 40 },
  });
});

test("records of more than one permutation, or none, throw", () => {
  const other = { ...iteration(1, {}), permutationHash: "0be07d35".padEnd(64, "0") };
  expect(() => aggregatePermutation([iteration(0, {}), other], [])).toThrow("of one permutation of one execution");
  expect(() => aggregatePermutation([], [])).toThrow("no container runs to aggregate");
});
