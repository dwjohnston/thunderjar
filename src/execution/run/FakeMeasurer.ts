/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import type { Reply } from "../../api/declarations.ts";
import type { RecordedMeasure } from "../../store/runDataStore.ts";
import type { Collected, Measurer } from "./types.ts";

type CollectOf = Parameters<Measurer["collect"]>[0];
type MeasureOf = Parameters<Measurer["measure"]>[0];
type Recorded = Parameters<Measurer["measure"]>[1];

/**
 * A Measurer for tests: loads nothing from a project. Unless told otherwise, the reply it collects
 * is the result file's text, there are no token costs, and the task has no measurements. Every
 * call is kept, so a test can check what a run was collected and measured with.
 */
export class FakeMeasurer implements Measurer {
  /** Each `collect`, in order. */
  readonly collected: { of: CollectOf; harnessResult: string | null }[] = [];
  /** Each `measure`, in order, the failed ones too. */
  readonly measured: { of: MeasureOf; recorded: Recorded }[] = [];
  private collecting: ((harnessResult: string | null) => Collected) | undefined;
  private measuring: Record<string, RecordedMeasure> = {};
  private collectFailure: string | undefined;
  private measureFailure: string | undefined;

  /** What each `collect` gives from now on: a value, or a function of the result file's text. */
  collects(result: Collected | ((harnessResult: string | null) => Collected)): this {
    this.collecting = typeof result === "function" ? result : () => result;
    return this;
  }

  /** What each `measure` gives from now on. */
  measures(result: Record<string, RecordedMeasure>): this {
    this.measuring = result;
    return this;
  }

  /** Makes each `collect` throw an Error with `message`; `undefined` clears it. */
  failCollect(message: string | undefined): this {
    this.collectFailure = message;
    return this;
  }

  /** Makes each `measure` throw an Error with `message`; `undefined` clears it. */
  failMeasure(message: string | undefined): this {
    this.measureFailure = message;
    return this;
  }

  async collect(of: CollectOf, harnessResult: string | null): Promise<Collected> {
    this.collected.push({ of, harnessResult });
    if (this.collectFailure !== undefined) throw new Error(this.collectFailure);
    if (this.collecting !== undefined) return this.collecting(harnessResult);
    const reply: Reply =
      harnessResult === null ? { outcome: "unavailable", reason: "the agent left no result file" } : { outcome: "collected", text: harnessResult };
    return { reply, tokenCosts: { outcome: "unavailable", reason: "notReported" } };
  }

  async measure(of: MeasureOf, recorded: Recorded): Promise<Record<string, RecordedMeasure>> {
    this.measured.push({ of, recorded });
    if (this.measureFailure !== undefined) throw new Error(this.measureFailure);
    return structuredClone(this.measuring);
  }
}
