// Applying a task's measurements to one container run — spec/085-test-case-results.md#applying-measurements.
// The run is reached only through its MeasurementContext, so a fresh run and a backfill take
// the same path.

import { resolve } from "node:path";
import type { Measurement } from "../project/config.ts";
import type { MeasurementContext, MeasurementResult } from "../api/declarations.ts";
import { hashMeasurement } from "../matrix/hashing.ts";
import { instruments, isInstrumentName, type Instrument } from "../instruments/instruments.ts";
import type { RecordedOutcome, Result } from "../store/run-data-store.ts";
import type { OpenedMeasurementContext } from "../running/runner.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A MeasurementResult as the run data store keeps it, with an error reduced to its message. */
const recordable = (result: MeasurementResult<unknown>): RecordedOutcome =>
  result.outcome === "erroredWhileMeasuring"
    ? { outcome: "erroredWhileMeasuring", error: { message: message(result.error) } }
    : result;

async function evaluate({ instrument, config, dir }: Measurement, ctx: MeasurementContext): Promise<RecordedOutcome> {
  try {
    if (!isInstrumentName(instrument)) throw new Error(`unknown instrument ${JSON.stringify(instrument)}`);
    const chosen = instruments[instrument] as Instrument<Record<string, string>, unknown>;
    const fields = config as Record<string, string>;
    // Bundled files reach the instrument as host paths, not relative to the measurement file.
    const bundled = Object.fromEntries((chosen.bundledFiles ?? []).map((key) => [key, resolve(dir, fields[key]!)]));
    return recordable(await chosen.evaluate({ ...fields, ...bundled }, ctx));
  } catch (error) {
    return { outcome: "erroredWhileMeasuring", error: { message: message(error) } };
  }
}

/**
 * Takes each measurement in turn, each against a context of its own from `open`, closed once
 * it is taken, so nothing one measurement writes is seen by the next. An instrument that throws
 * gives that measure `erroredWhileMeasuring`; the others are still taken. Each measure is dated
 * when it was taken.
 */
export async function measureContainerRun(
  measurements: Measurement[],
  open: () => Promise<OpenedMeasurementContext>,
  now: () => number = Date.now,
): Promise<Result> {
  const result: Result = {};
  for (const measurement of measurements) {
    const ctx = await open();
    let outcome: RecordedOutcome;
    try {
      outcome = await evaluate(measurement, ctx);
    } finally {
      await ctx.close();
    }
    result[measurement.name] = {
      instrument: measurement.instrument,
      contentHash: hashMeasurement(measurement),
      measuredAt: new Date(now()).toISOString(),
      outcome,
    };
  }
  return result;
}
