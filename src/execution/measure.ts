// Taking a task's measurements of one container run. The run is reached only through the
// measurement contexts it's given, so measuring a fresh run and a past one is the same.
import type { MeasurementResult } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import { type Instrument, instruments } from "../instruments/instruments.ts";
import type { RecordedMeasure, RecordedOutcome } from "../store/runDataStore.ts";
import type { OpenedMeasurementContext } from "./measurementContext.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A MeasurementResult as the store keeps it, an error by its message. */
const recordable = (result: MeasurementResult<unknown>): RecordedOutcome =>
  result.outcome === "erroredWhileMeasuring" ? { outcome: "erroredWhileMeasuring", error: { message: message(result.error) } } : result;

/**
 * Takes each measurement in turn, each against a context of its own from `open`, closed once it's
 * taken, so nothing one measurement writes is seen by the next. An instrument that throws gives
 * its measure `erroredWhileMeasuring`, and the rest are still taken. Each measure is dated when
 * it's taken. Throws if a context can't be opened or closed.
 */
export async function measureContainerRun(
  measurements: Measurement[],
  open: () => Promise<OpenedMeasurementContext>,
  now: () => Date = () => new Date(),
): Promise<Record<string, RecordedMeasure>> {
  const result: Record<string, RecordedMeasure> = {};
  for (const { name, declaration, config, contentHash } of measurements) {
    const instrument = instruments[declaration.instrument] as Instrument<Record<string, string>, unknown>;
    const ctx = await open();
    let outcome: RecordedOutcome;
    try {
      outcome = recordable(await instrument.evaluate(config, ctx));
    } catch (error) {
      outcome = { outcome: "erroredWhileMeasuring", error: { message: message(error) } };
    } finally {
      await ctx.close();
    }
    result[name] = { instrument: declaration.instrument, contentHash, measuredAt: now().toISOString(), outcome };
  }
  return result;
}
