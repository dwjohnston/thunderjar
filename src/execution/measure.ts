// Taking a task's measurements of one container run. The run is reached only through the
// measurement contexts it's given, so measuring a fresh run and a past one is the same.
import type { MeasurementResult } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import { type Instrument, instruments } from "../instruments/instruments.ts";
import type { RecordedMeasure, RecordedOutcome } from "../store/runDataStore.ts";
import { inParallel } from "./inParallel.ts";
import type { OpenedMeasurementContext } from "./measurementContext.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A MeasurementResult as the store keeps it, an error by its message. */
const recordable = (result: MeasurementResult<unknown>): RecordedOutcome =>
  result.outcome === "erroredWhileMeasuring" ? { outcome: "erroredWhileMeasuring", error: { message: message(result.error) } } : result;

/**
 * Takes each measurement, up to `concurrency` at once, each against a context of its own from
 * `open`, closed once it's taken, so nothing one measurement writes is seen by another, whether
 * they're taken in turn or together. `open` is told whether the instrument needs a measurement
 * container, or only what was recorded of the run. An instrument that throws gives its measure
 * `erroredWhileMeasuring`, and the rest are still taken. Each measure is dated when it's taken,
 * and they're returned in the order declared. Throws if a context can't be opened or closed.
 */
export async function measureContainerRun(
  measurements: Measurement[],
  open: (usesContainer: boolean) => Promise<OpenedMeasurementContext>,
  now: () => Date = () => new Date(),
  concurrency = 1,
): Promise<Record<string, RecordedMeasure>> {
  const measures = new Map<string, RecordedMeasure>();
  await inParallel(
    measurements.map(({ name, declaration, config, contentHash }) => async () => {
      const instrument = instruments[declaration.instrument] as Instrument<Record<string, string>, unknown>;
      const ctx = await open(instrument.usesContainer !== false);
      let outcome: RecordedOutcome;
      try {
        outcome = recordable(await instrument.evaluate(config, ctx));
      } catch (error) {
        outcome = { outcome: "erroredWhileMeasuring", error: { message: message(error) } };
      } finally {
        await ctx.close();
      }
      measures.set(name, { instrument: declaration.instrument, contentHash, measuredAt: now().toISOString(), outcome });
    }),
    concurrency,
  );
  // In the order declared, whatever order they finished in.
  return Object.fromEntries(measurements.flatMap(({ name }) => (measures.has(name) ? [[name, measures.get(name) as RecordedMeasure]] : [])));
}
