// Remeasure — spec/085-test-case-results.md#backfilling-measurements. Works out which stored
// measures a backfill takes again.

import type { Measurement } from "../project/config.ts";
import type { RecordedMeasure } from "../store/run-data-store.ts";

export type MeasureStatus = "missing" | "stale" | "current";

export function measureStatus(_recorded: RecordedMeasure | undefined, _measurement: Measurement): MeasureStatus {
  throw new Error("not implemented");
}
