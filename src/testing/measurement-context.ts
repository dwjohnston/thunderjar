// Measurement contexts over directories on disk, for testing instruments without running an
// agent: the host runner's own, so an instrument is tested against what `run` gives it.
// Tests of lower layers reach running/ through here, never by importing it themselves.

export { createHostMeasurementOpener, type OpenedMeasurementContext } from "../running/runner.ts";
