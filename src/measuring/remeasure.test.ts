import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { hashMeasurement } from "../matrix/hashing.ts";
import type { Measurement } from "../project/config.ts";
import type { RecordedMeasure, RecordedOutcome } from "../store/run-data-store.ts";
import { measureStatus } from "./remeasure.ts";

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
