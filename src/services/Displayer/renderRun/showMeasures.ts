/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// A container run's measures, as `run` shows them under it.
import type { RecordedMeasure, RecordedOutcome } from "../../../store/runDataStore.ts";
import type { Paint } from "../../../cli/colour.ts";

/** A measured value as `run` prints it: JSON, but with an object's keys unquoted, `{passed: 4, failed: 1}`. */
const showValue = (value: unknown): string =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? `{${Object.entries(value)
        .map(([key, v]) => `${key}: ${showValue(v)}`)
        .join(", ")}}`
    : (JSON.stringify(value) ?? String(value));

/** A measured value, coloured: `true` green, `false` red, anything else as it is. */
const paintValue = (paint: Paint, data: unknown) =>
  data === true ? paint.green("true") : data === false ? paint.red("false") : showValue(data);

/** A measure as `run` prints it: its value, or why it has none. */
const showOutcome = (outcome: RecordedOutcome, paint: Paint) =>
  outcome.outcome === "measured"
    ? paintValue(paint, outcome.data)
    : outcome.outcome === "skipped"
      ? paint.yellow(`skipped${outcome.reason ? ` (${outcome.reason})` : ""}`)
      : paint.red(`erroredWhileMeasuring (${outcome.error.message})`);

/** A container run's measures, on one line: `<name>: <value>`, three spaces apart. */
export const showMeasures = (result: Record<string, RecordedMeasure>, paint: Paint) =>
  Object.entries(result)
    .map(([name, { outcome }]) => `${paint.blue(`${name}:`)} ${showOutcome(outcome, paint)}`)
    .join("   ");
