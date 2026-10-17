// Remeasure — spec/085-test-case-results.md#backfilling-measurements. Works out which stored
// measures a backfill takes again.

import { hashMeasurement } from "../matrix/hashing.ts";
import type { Measurement } from "../project/config.ts";
import type { RecordedMeasure } from "../store/run-data-store.ts";

export type MeasureStatus = "missing" | "stale" | "current";

/**
 * Whether a container run's stored measure is still what `measurement` would take
 * (spec/085-test-case-results.md#name-is-identity-hash-is-version). Stale is a mismatch of
 * the full content hash, so an edited `aggregate` alone never is. An errored measure counts as
 * missing, so a backfill retries it even when its hash matches; a skipped one is a real outcome.
 */
export function measureStatus(recorded: RecordedMeasure | undefined, measurement: Measurement): MeasureStatus {
  if (recorded === undefined || recorded.outcome.outcome === "erroredWhileMeasuring") return "missing";
  return recorded.contentHash === hashMeasurement(measurement) ? "current" : "stale";
}
