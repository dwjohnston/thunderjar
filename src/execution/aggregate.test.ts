import { describe, expect, test } from "bun:test";
import type { MeasurementDeclaration } from "../api/declarations.ts";
import type { ContainerRunRecord, RecordedOutcome } from "../store/runDataStore.ts";
import { aggregatePermutation, aggregateValues } from "./aggregate.ts";

describe("aggregateValues", () => {
  test("booleans: rate is the fraction true, count the number true", () => {
    expect(aggregateValues([true, false, true, true], ["rate", "count"])).toEqual({ rate: 0.75, count: 3 });
  });

  test("numbers: mean, median, min, max and sum", () => {
    expect(aggregateValues([3, 1, 2, 10], ["mean", "median", "min", "max", "sum"])).toEqual({ mean: 4, median: 2.5, min: 1, max: 10, sum: 16 });
    expect(aggregateValues([5, 1, 3], ["median"])).toEqual({ median: 3 });
  });

  test("records of numbers: sum and mean key by key, a missing key counting as 0", () => {
    expect(
      aggregateValues(
        [
          { passed: 3, failed: 2 },
          { passed: 5, failed: 0 },
          { passed: 4 },
        ],
        ["sum", "mean"],
      ),
    ).toEqual({ sum: { passed: 12, failed: 2 }, mean: { passed: 4, failed: 2 / 3 } });
  });

  test("keys are in the order the methods are given", () => {
    expect(Object.keys(aggregateValues([1, 2], ["max", "mean", "min"]))).toEqual(["max", "mean", "min"]);
  });

  test("no values give no keys", () => {
    expect(aggregateValues([], ["rate"])).toEqual({});
  });

  test("a method that doesn't combine the values' type throws", () => {
    expect(() => aggregateValues([true], ["mean"])).toThrow('"mean" doesn\'t combine booleans');
  });

  test("values of mixed or unknown types throw", () => {
    expect(() => aggregateValues([true, 1], ["sum"])).toThrow("can't combine [true,1]");
    expect(() => aggregateValues(["a"], ["sum"])).toThrow("not all booleans, numbers or records of numbers");
  });
});

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
      Object.entries(outcomes).map(([name, outcome]) => [name, { instrument: "grep", contentHash: "c", measuredAt: "2026-10-01T10:00:01.000Z", outcome }]),
    ),
  };
}

const measurement = (name: string, declaration: MeasurementDeclaration) => ({ name, declaration });
const EXISTS = measurement("exists", { instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, aggregate: ["rate"] });
const IGNORES = measurement("ignores", { instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" }, aggregate: ["mean", "max"] });

describe("aggregatePermutation", () => {
  test("combines each measurement's values across the runs, by its methods, in the measurements' order", () => {
    const runs = [run(1, { exists: measured(true), ignores: measured(1) }), run(2, { exists: measured(false), ignores: measured(3) })];

    const measures = aggregatePermutation(runs, [IGNORES, EXISTS]);

    expect(measures).toEqual({
      ignores: { measured: 2, values: { mean: 2, max: 3 } },
      exists: { measured: 2, values: { rate: 0.5 } },
    });
    expect(Object.keys(measures)).toEqual(["ignores", "exists"]);
  });

  test("leaves out an iteration that was skipped, errored while measuring, or never measured", () => {
    const runs = [
      run(1, { ignores: measured(2) }),
      run(2, { ignores: { outcome: "skipped", reason: "no file matches **/*.ts" } }),
      run(3, { ignores: { outcome: "erroredWhileMeasuring", error: { message: "boom" } } }),
      run(4, {}),
      run(5, { ignores: measured(4) }),
    ];

    expect(aggregatePermutation(runs, [IGNORES])).toEqual({ ignores: { measured: 2, values: { mean: 3, max: 4 } } });
  });

  test("a measurement no run measured has no values", () => {
    expect(aggregatePermutation([run(1, {})], [EXISTS])).toEqual({ exists: { measured: 0, values: {} } });
  });

  test("ignores a recorded measure the task no longer declares", () => {
    expect(aggregatePermutation([run(1, { deleted: measured(true), exists: measured(true) })], [EXISTS])).toEqual({
      exists: { measured: 1, values: { rate: 1 } },
    });
  });
});
