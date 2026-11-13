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
 * Takes each measurement, and returns each measure, dated when it's taken, in the order of
 * `measurements`. Those whose instrument needs a measurement container share one, from
 * `open(true)`, opened for the first and closed after the last, and are taken one after another,
 * in that order: on a remote runtime, starting a container costs far more than the commands
 * measuring runs in it. So what one writes, the next sees. Those that read only what was recorded
 * of the run each get a context from `open(false)`, taken while the others are. An instrument that
 * throws gives its measure `erroredWhileMeasuring`, and the rest are still taken. Throws if a
 * context can't be opened or closed, once those already being taken are.
 */
export async function measureContainerRun(
  measurements: Measurement[],
  open: (usesContainer: boolean) => Promise<OpenedMeasurementContext>,
  now: () => Date = () => new Date(),
): Promise<Record<string, RecordedMeasure>> {
  const taken = new Map<string, RecordedMeasure>();
  const instrumentOf = ({ declaration }: Measurement) => instruments[declaration.instrument] as Instrument<Record<string, string>, unknown>;
  const take = async (measurement: Measurement, ctx: OpenedMeasurementContext) => {
    const { name, declaration, config, contentHash } = measurement;
    let outcome: RecordedOutcome;
    try {
      outcome = recordable(await instrumentOf(measurement).evaluate(config, ctx));
    } catch (error) {
      outcome = { outcome: "erroredWhileMeasuring", error: { message: message(error) } };
    }
    taken.set(name, { instrument: declaration.instrument, contentHash, measuredAt: now().toISOString(), outcome });
  };
  const inContainer = measurements.filter((measurement) => instrumentOf(measurement).usesContainer !== false);
  const fromRecord = measurements.filter((measurement) => instrumentOf(measurement).usesContainer === false);

  const containerMeasurements = async () => {
    if (inContainer.length === 0) return;
    const ctx = await open(true);
    try {
      for (const measurement of inContainer) await take(measurement, ctx);
    } finally {
      await ctx.close();
    }
  };
  const recordMeasurements = fromRecord.map(async (measurement) => {
    const ctx = await open(false);
    try {
      await take(measurement, ctx);
    } finally {
      await ctx.close();
    }
  });
  const settled = await Promise.allSettled([containerMeasurements(), ...recordMeasurements]);
  const failed = settled.find((outcome) => outcome.status === "rejected");
  if (failed) throw failed.reason;

  const result: Record<string, RecordedMeasure> = {};
  for (const { name } of measurements) {
    const measure = taken.get(name);
    if (measure !== undefined) result[name] = measure;
  }
  return result;
}
