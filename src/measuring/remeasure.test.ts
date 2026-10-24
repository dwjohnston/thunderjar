import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { hashMeasurement } from "../matrix/hashing.ts";
import type { Measurement } from "../project/config.ts";
import type { ContainerRunRecord, RecordedMeasure, RecordedOutcome, Result } from "../store/run-data-store.ts";
import { measureStatus, planRemeasure } from "./remeasure.ts";

const isPrimeTsExists: Measurement = {
  name: "isPrimeTsExists",
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
  dir: "/measurements",
};

/** A measure recorded with `contentHash`. */
const recorded = (contentHash: string, outcome: RecordedOutcome = { outcome: "measured", data: true }): RecordedMeasure => ({
  instrument: "fileCreated",
  contentHash,
  measuredAt: "2026-09-29T14:31:03.000Z",
  outcome,
});

test("no recorded measure is missing", () => {
  expect(measureStatus(undefined, isPrimeTsExists)).toBe("missing");
});

describe("a measured result", () => {
  test("is current when its hash matches", () => {
    expect(measureStatus(recorded(hashMeasurement(isPrimeTsExists)), isPrimeTsExists)).toBe("current");
  });

  test("is stale once the measurement's config changes", () => {
    const edited: Measurement = { ...isPrimeTsExists, config: { glob: "src/isPrime.ts" } };
    expect(measureStatus(recorded(hashMeasurement(isPrimeTsExists)), edited)).toBe("stale");
  });

  test("is stale when the hashes share their first eight characters but differ later", () => {
    const hash = hashMeasurement(isPrimeTsExists);
    const differsLater = hash.slice(0, -1) + (hash.endsWith("0") ? "1" : "0");
    expect(measureStatus(recorded(differsLater), isPrimeTsExists)).toBe("stale");
    expect(measureStatus(recorded(hash.slice(0, 8)), isPrimeTsExists)).toBe("stale");
  });

  test("stays current when only aggregate changes", () => {
    const reaggregated: Measurement = { ...isPrimeTsExists, aggregate: ["count"] };
    expect(measureStatus(recorded(hashMeasurement(isPrimeTsExists)), reaggregated)).toBe("current");
  });
});

describe("an outcome other than measured", () => {
  const errored: RecordedOutcome = { outcome: "erroredWhileMeasuring", error: { message: "glob exploded" } };
  const skipped: RecordedOutcome = { outcome: "skipped", reason: "no isPrime.ts to test" };

  test("an error is missing, so it is retried, even when its hash matches", () => {
    expect(measureStatus(recorded(hashMeasurement(isPrimeTsExists), errored), isPrimeTsExists)).toBe("missing");
  });

  test("a skip is a real outcome: current when its hash matches", () => {
    expect(measureStatus(recorded(hashMeasurement(isPrimeTsExists), skipped), isPrimeTsExists)).toBe("current");
  });

  test("a skip is stale when its hash differs", () => {
    const edited: Measurement = { ...isPrimeTsExists, config: { glob: "src/isPrime.ts" } };
    expect(measureStatus(recorded(hashMeasurement(isPrimeTsExists), skipped), edited)).toBe("stale");
  });
});

describe("a template-backed measurement", () => {
  // The same measurement in two folders, whose bundled templates differ: v2 gained a test.
  const isPrimeTemplateTest = (version: "v1" | "v2"): Measurement => ({
    name: "isPrimeTemplateTest",
    instrument: "templateTest",
    config: { subject: "**/isPrime.ts", template: "./isPrime.test.template.txt" },
    aggregate: ["sum"],
    dir: join(import.meta.dir, "remeasure-templates", version),
  });
  const measured = (measurement: Measurement) => ({
    ...recorded(hashMeasurement(measurement), { outcome: "measured", data: { passed: 2, failed: 0 } }),
    instrument: "templateTest",
  });

  test("is current when recorded against the same template", () => {
    expect(measureStatus(measured(isPrimeTemplateTest("v2")), isPrimeTemplateTest("v2"))).toBe("current");
  });

  test("is stale when recorded against different template contents", () => {
    expect(measureStatus(measured(isPrimeTemplateTest("v1")), isPrimeTemplateTest("v2"))).toBe("stale");
  });
});

describe("planRemeasure", () => {
  /** A fileCreated measurement of `glob`; measurements differ by glob, so they hash differently. */
  const fileCreated = (name: string, glob: string): Extract<Measurement, { instrument: "fileCreated" }> => ({
    name,
    instrument: "fileCreated",
    config: { glob },
    aggregate: ["rate"],
    dir: "/measurements",
  });
  const isPrimeTsExists = fileCreated("isPrimeTsExists", "**/isPrime.ts");
  const readmeExists = fileCreated("readmeExists", "README.md");
  const tsconfigExists = fileCreated("tsconfigExists", "tsconfig.json");

  /** A result holding, by name, each measurement's measure as taken with its hash. */
  const resultOf = (...measurements: Measurement[]): Result =>
    Object.fromEntries(measurements.map((m) => [m.name, recorded(hashMeasurement(m))]));

  const EXECUTION = "01k4x9j2e8mqz3";
  const postrun = (iteration: number, executionId = EXECUTION) => `postrun-e${executionId}-h4f9a21c8-i0${iteration}`;

  /** Iteration `iteration` of `executionId`, its agent exiting with `exitCode`. */
  const containerRun = (executionId: string, iteration: number, result: Result, exitCode = 0): ContainerRunRecord => ({
    executionId,
    testCase: "is-prime-baseline",
    task: "is-prime",
    permutationHash: "4f9a21c8e0b7".padEnd(64, "0"),
    iteration,
    postrunImage: postrun(iteration, executionId),
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
    execution: { startedAt: 1790692255000, finishedAt: 1790692295000, exitCode },
  });

  test("schedules only missing and stale measurements, sorted, and leaves out a run with nothing to do", () => {
    const staleTsconfig = fileCreated("tsconfigExists", "old/tsconfig.json");
    // Listed out of name order, so the plan's order comes from sorting.
    const measurements = [tsconfigExists, readmeExists, isPrimeTsExists];
    const records = [
      containerRun(EXECUTION, 0, resultOf(isPrimeTsExists, staleTsconfig)),
      containerRun(EXECUTION, 1, resultOf(isPrimeTsExists, readmeExists, tsconfigExists)),
    ];
    expect(planRemeasure(records, measurements).runs).toEqual([
      { executionId: EXECUTION, postrunImage: postrun(0), measurementNames: ["readmeExists", "tsconfigExists"] },
    ]);
  });

  test("omits a current skipped measure, and schedules an errored one even when its hash matches", () => {
    const hash = hashMeasurement(isPrimeTsExists);
    const records = [
      containerRun(EXECUTION, 0, { isPrimeTsExists: recorded(hash, { outcome: "skipped", reason: "nothing to look in" }) }),
      containerRun(EXECUTION, 1, {
        isPrimeTsExists: recorded(hash, { outcome: "erroredWhileMeasuring", error: { message: "glob exploded" } }),
      }),
    ];
    expect(planRemeasure(records, [isPrimeTsExists]).runs).toEqual([
      { executionId: EXECUTION, postrunImage: postrun(1), measurementNames: ["isPrimeTsExists"] },
    ]);
  });

  test("never schedules a measurement deleted from the task", () => {
    const records = [containerRun(EXECUTION, 0, resultOf(isPrimeTsExists, readmeExists))];
    expect(planRemeasure(records, [isPrimeTsExists]).runs).toEqual([]);
  });

  test("a rename schedules the new name and leaves the old one stored, even when both hash identically", () => {
    const renamed: Measurement = { ...readmeExists, name: "readmePresent" };
    expect(hashMeasurement(renamed)).toBe(hashMeasurement(readmeExists));
    const records = [containerRun(EXECUTION, 0, resultOf(readmeExists))];
    const before = structuredClone(records);

    expect(planRemeasure(records, [renamed]).runs).toEqual([
      { executionId: EXECUTION, postrunImage: postrun(0), measurementNames: ["readmePresent"] },
    ]);
    expect(records).toEqual(before);
  });

  test("an edit to aggregate alone schedules nothing", () => {
    const records = [containerRun(EXECUTION, 0, resultOf(isPrimeTsExists))];
    const reaggregated: Measurement = { ...isPrimeTsExists, aggregate: ["count"] };
    expect(planRemeasure(records, [reaggregated]).runs).toEqual([]);
  });

  test("no records, or no current measurements, give no run work", () => {
    expect(planRemeasure([], [isPrimeTsExists, readmeExists]).runs).toEqual([]);
    expect(planRemeasure([containerRun(EXECUTION, 0, resultOf(readmeExists))], []).runs).toEqual([]);
  });

  test("keeps each run's execution and the input order, with the same rules for non-zero exits", () => {
    const LATER = "01k4xc5w7r1ta6";
    // The later execution listed first; among the runs, a failed agent and a timed-out one.
    const records = [
      containerRun(LATER, 0, resultOf(isPrimeTsExists), 1),
      containerRun(LATER, 1, resultOf(isPrimeTsExists, readmeExists), 137),
      containerRun(EXECUTION, 0, {}),
      containerRun(EXECUTION, 1, resultOf(readmeExists), 1),
    ];
    const before = structuredClone(records);

    expect(planRemeasure(records, [readmeExists, isPrimeTsExists]).runs).toEqual([
      { executionId: LATER, postrunImage: postrun(0, LATER), measurementNames: ["readmeExists"] },
      { executionId: EXECUTION, postrunImage: postrun(0), measurementNames: ["isPrimeTsExists", "readmeExists"] },
      { executionId: EXECUTION, postrunImage: postrun(1), measurementNames: ["isPrimeTsExists"] },
    ]);
    expect(records).toEqual(before);
    expect(records.flatMap((r) => Object.values(r.result).map((m) => m.measuredAt))).toEqual(
      Array(4).fill("2026-09-29T14:31:03.000Z"),
    );
  });

  describe("executions", () => {
    const LATER = "01k4xc5w7r1ta6";
    const errored = (measurement: Measurement) =>
      recorded(hashMeasurement(measurement), { outcome: "erroredWhileMeasuring", error: { message: "glob exploded" } });
    const skipped = (measurement: Measurement) =>
      recorded(hashMeasurement(measurement), { outcome: "skipped", reason: "nothing to look in" });

    test("a measurement current in one execution and stale in another, and a new one missing from both", () => {
      const staleIsPrime = fileCreated("isPrimeTsExists", "src/isPrime.ts");
      const records = [
        containerRun(EXECUTION, 0, resultOf(isPrimeTsExists)),
        containerRun(EXECUTION, 1, resultOf(isPrimeTsExists)),
        containerRun(LATER, 0, resultOf(staleIsPrime)),
        containerRun(LATER, 1, resultOf(staleIsPrime)),
      ];

      expect(planRemeasure(records, [readmeExists, isPrimeTsExists])).toEqual({
        runs: [
          { executionId: EXECUTION, postrunImage: postrun(0), measurementNames: ["readmeExists"] },
          { executionId: EXECUTION, postrunImage: postrun(1), measurementNames: ["readmeExists"] },
          { executionId: LATER, postrunImage: postrun(0, LATER), measurementNames: ["isPrimeTsExists", "readmeExists"] },
          { executionId: LATER, postrunImage: postrun(1, LATER), measurementNames: ["isPrimeTsExists", "readmeExists"] },
        ],
        executions: [
          {
            executionId: EXECUTION,
            measurements: [
              { name: "isPrimeTsExists", contentHash: hashMeasurement(isPrimeTsExists), status: "current" },
              { name: "readmeExists", contentHash: hashMeasurement(readmeExists), status: "missing" },
            ],
            deleted: [],
          },
          {
            executionId: LATER,
            measurements: [
              { name: "isPrimeTsExists", contentHash: hashMeasurement(isPrimeTsExists), status: "stale" },
              { name: "readmeExists", contentHash: hashMeasurement(readmeExists), status: "missing" },
            ],
            deleted: [],
          },
        ],
      });
    });

    test("counts each execution's stored measures of a deleted name, whatever their outcome, in first-seen order", () => {
      // Two names deleted from the task, the later name first in the Result, so the order comes from sorting.
      const records = [
        containerRun(LATER, 0, { tsconfigExists: skipped(tsconfigExists), readmeExists: errored(readmeExists) }),
        containerRun(EXECUTION, 0, resultOf(isPrimeTsExists, readmeExists)),
        containerRun(LATER, 1, resultOf(isPrimeTsExists)),
        containerRun(EXECUTION, 1, { ...resultOf(isPrimeTsExists), readmeExists: skipped(readmeExists) }),
        containerRun(EXECUTION, 2, resultOf(isPrimeTsExists)),
      ];

      expect(planRemeasure(records, [isPrimeTsExists]).executions).toEqual([
        {
          executionId: LATER,
          measurements: [{ name: "isPrimeTsExists", contentHash: hashMeasurement(isPrimeTsExists), status: "missing" }],
          deleted: [
            { name: "readmeExists", storedMeasures: 1 },
            { name: "tsconfigExists", storedMeasures: 1 },
          ],
        },
        {
          executionId: EXECUTION,
          measurements: [{ name: "isPrimeTsExists", contentHash: hashMeasurement(isPrimeTsExists), status: "current" }],
          deleted: [{ name: "readmeExists", storedMeasures: 2 }],
        },
      ]);
    });

    test("a rename deletes the old name, with its stored count, and the new name is missing despite an equal hash", () => {
      const renamed: Measurement = { ...readmeExists, name: "readmePresent" };
      expect(hashMeasurement(renamed)).toBe(hashMeasurement(readmeExists));
      const records = [
        containerRun(EXECUTION, 0, resultOf(readmeExists)),
        containerRun(EXECUTION, 1, resultOf(readmeExists)),
      ];
      const before = structuredClone(records);

      expect(planRemeasure(records, [renamed]).executions).toEqual([
        {
          executionId: EXECUTION,
          measurements: [{ name: "readmePresent", contentHash: hashMeasurement(readmeExists), status: "missing" }],
          deleted: [{ name: "readmeExists", storedMeasures: 2 }],
        },
      ]);
      expect(records).toEqual(before);
    });

    test("missing, or errored, in any run outranks stale, which outranks current, whatever the run order", () => {
      const staleIsPrime = fileCreated("isPrimeTsExists", "src/isPrime.ts");
      const staleReadme = fileCreated("readmeExists", "docs/README.md");
      const staleTsconfig = fileCreated("tsconfigExists", "old/tsconfig.json");
      const records = [
        // isPrimeTsExists: missing, stale, current. readmeExists: current, stale, current.
        // tsconfigExists: stale, current, errored.
        containerRun(EXECUTION, 0, resultOf(readmeExists, staleTsconfig)),
        containerRun(EXECUTION, 1, resultOf(staleIsPrime, staleReadme, tsconfigExists)),
        containerRun(EXECUTION, 2, { ...resultOf(isPrimeTsExists, readmeExists), tsconfigExists: errored(tsconfigExists) }),
      ];

      expect(planRemeasure(records, [tsconfigExists, readmeExists, isPrimeTsExists]).executions).toEqual([
        {
          executionId: EXECUTION,
          measurements: [
            { name: "isPrimeTsExists", contentHash: hashMeasurement(isPrimeTsExists), status: "missing" },
            { name: "readmeExists", contentHash: hashMeasurement(readmeExists), status: "stale" },
            { name: "tsconfigExists", contentHash: hashMeasurement(tsconfigExists), status: "missing" },
          ],
          deleted: [],
        },
      ]);
    });

    test("an execution with no run work still has a summary", () => {
      const fullyCurrent = [
        containerRun(EXECUTION, 0, resultOf(isPrimeTsExists)),
        containerRun(EXECUTION, 1, resultOf(isPrimeTsExists)),
      ];
      expect(planRemeasure(fullyCurrent, [isPrimeTsExists])).toEqual({
        runs: [],
        executions: [
          {
            executionId: EXECUTION,
            measurements: [{ name: "isPrimeTsExists", contentHash: hashMeasurement(isPrimeTsExists), status: "current" }],
            deleted: [],
          },
        ],
      });

      // The task now declares no measurements, so everything stored is deleted.
      const nothingDeclared = [containerRun(LATER, 0, resultOf(readmeExists)), containerRun(LATER, 1, {})];
      expect(planRemeasure(nothingDeclared, [])).toEqual({
        runs: [],
        executions: [{ executionId: LATER, measurements: [], deleted: [{ name: "readmeExists", storedMeasures: 1 }] }],
      });
    });

    test("no records give no execution summaries", () => {
      expect(planRemeasure([], [isPrimeTsExists, readmeExists])).toEqual({ runs: [], executions: [] });
    });
  });
});
