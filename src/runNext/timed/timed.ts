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

// Timing a phase of the execution into the run state, where `--timings` and `--json` show it.
import { addTiming, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { Dependencies } from "../types.ts";

/** The phases, in the order they're shown. */
export const PHASES = ["build", "pushPrerun", "pullPrerun", "agent", "collect", "commit", "secretSearch", "pushPostrun", "measure"] as const;
export type Phase = (typeof PHASES)[number];

/** Runs `job` as one run of `phase`, adding how long it took to the state, whether it returns or throws. */
export async function timed<T>(deps: Pick<Dependencies, "state" | "clock">, phase: Phase, job: () => Promise<T>): Promise<T> {
  const startedAt = deps.clock.now();
  try {
    return await job();
  } finally {
    const ms = deps.clock.now() - startedAt;
    deps.state.update(updateRun((run) => addTiming(run, phase, ms)));
  }
}
