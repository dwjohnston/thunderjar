// The built-in measuring instruments — spec/060-test-case-parameters.md#measuring-instruments--measurements.
// Each is host-side logic run against a MeasurementContext, so it is unit-testable against a
// directory on disk without a measurement container.

import type { InstrumentName, InstrumentTypes, MeasurementContext, MeasurementResult } from "./declarations.ts";

export interface Instrument<Config, Value> {
  evaluate(config: Config, ctx: MeasurementContext): Promise<MeasurementResult<Value>>;
  /**
   * Problems with a config loaded at runtime, which the type checker may not have seen, as
   * `[field, message]` pairs. Empty if it is fine.
   */
  checkConfig(config: unknown): [field: string, message: string][];
}

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/**
 * `true` if `glob` matches at least one file under the workdir. Never `skipped`: no match is
 * the answer `false`, not a missing input.
 */
export const fileCreated: Instrument<{ glob: string }, boolean> = {
  async evaluate({ glob }, ctx) {
    return { outcome: "measured", data: (await ctx.glob(glob)).length > 0 };
  },
  checkConfig(config) {
    const glob = (config as { glob?: unknown } | undefined)?.glob;
    return typeof glob === "string" && glob !== "" ? [] : [["config.glob", `must be a glob pattern, got ${show(glob)}`]];
  },
};

/** Every built-in instrument, by the name a measurement gives as its `instrument`. */
export const instruments: {
  [I in InstrumentName]: Instrument<InstrumentTypes[I]["config"], InstrumentTypes[I]["value"]>;
} = { fileCreated };

export const isInstrumentName = (name: unknown): name is InstrumentName =>
  typeof name === "string" && Object.hasOwn(instruments, name);
