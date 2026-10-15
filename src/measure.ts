// Applying a task's measurements to one container run — spec/085-test-case-results.md#applying-measurements.
// The run is reached only through its MeasurementContext, so a fresh run and a backfill take
// the same path.

import type { Measurement } from "./config.ts";
import type { MeasurementContext, MeasurementResult } from "./declarations.ts";
import { hashMeasurement } from "./hashing.ts";
import { instruments, isInstrumentName } from "./instruments.ts";
import type { RecordedOutcome, Result } from "./run-data-store.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A MeasurementResult as the run data store keeps it, with an error reduced to its message. */
const recordable = (result: MeasurementResult<unknown>): RecordedOutcome =>
  result.outcome === "erroredWhileMeasuring"
    ? { outcome: "erroredWhileMeasuring", error: { message: message(result.error) } }
    : result;

async function evaluate({ instrument, config }: Measurement, ctx: MeasurementContext): Promise<RecordedOutcome> {
  try {
    if (!isInstrumentName(instrument)) throw new Error(`unknown instrument ${JSON.stringify(instrument)}`);
    return recordable(await instruments[instrument].evaluate(config, ctx));
  } catch (error) {
    return { outcome: "erroredWhileMeasuring", error: { message: message(error) } };
  }
}

/**
 * Takes each measurement in turn against `ctx`. An instrument that throws gives that measure
 * `erroredWhileMeasuring`; the others are still taken. Each measure is dated when it was taken.
 */
export async function measureContainerRun(
  measurements: Measurement[],
  ctx: MeasurementContext,
  now: () => number = Date.now,
): Promise<Result> {
  const result: Result = {};
  for (const measurement of measurements) {
    const outcome = await evaluate(measurement, ctx);
    result[measurement.name] = {
      instrument: measurement.instrument,
      contentHash: hashMeasurement(measurement),
      measuredAt: new Date(now()).toISOString(),
      outcome,
    };
  }
  return result;
}
