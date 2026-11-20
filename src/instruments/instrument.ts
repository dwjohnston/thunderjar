// What every instrument is, and the config checks they share.
import type { MeasurementContext, MeasurementResult, Score } from "../api/declarations.ts";

/** What a score is, at runtime. */
export type ScoreKind = "boolean" | "number";

export type Instrument<Config, Value> = {
  /**
   * The version of the shape of its value. A measurement's content hash covers it, so a measure
   * stored before the shape changed is stale, rather than read by a score written for the new one.
   */
  version: number;
  evaluate(config: Config, ctx: MeasurementContext): Promise<MeasurementResult<Value>>;
  /**
   * The score a metric without a `score` of its own reads, and what kind it is: the value itself
   * for a number or a boolean. Absent if a metric of it always needs a `score`.
   */
  defaultScore?: { kind: ScoreKind; score: (value: Value) => Score | undefined };
  /**
   * The problems with a config loaded at runtime, which the type checker may not have seen, as
   * `[field, message]` pairs. Empty if it is fine.
   */
  checkConfig(config: unknown): [field: string, message: string][];
  /**
   * The config fields whose values are files that come with the measurement, as paths relative
   * to its file. The config loader checks they exist, the measurement's content hash covers what
   * they hold, and `evaluate` is given them as absolute paths on the host.
   */
  bundledFiles?: readonly (keyof Config & string)[];
  /**
   * False for an instrument that only reads what was recorded of the run, like its reply, so no
   * measurement container is started for it.
   */
  usesContainer?: false;
};

export const show = (value: unknown) => JSON.stringify(value) ?? String(value);

export const checkString = (field: string, value: unknown, what: string): [string, string][] =>
  typeof value === "string" && value !== "" ? [] : [[field, `must be ${what}, got ${show(value)}`]];

/** Why `pattern` isn't a JavaScript regular expression, as a config problem, if it isn't one. */
export function checkPattern(pattern: unknown): [string, string][] {
  if (typeof pattern !== "string") return [["config.pattern", `must be a JavaScript regular expression, got ${show(pattern)}`]];
  try {
    new RegExp(pattern);
    return [];
  } catch (error) {
    const reason = (error as Error).message.replace(/^Invalid regular expression: /, "");
    return [["config.pattern", `${show(pattern)} is not a valid regular expression: ${reason}`]];
  }
}

