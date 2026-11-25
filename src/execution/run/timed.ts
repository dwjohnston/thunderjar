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

import { recordTiming, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { Dependencies } from "./types.ts";

/**
 * Runs `job` as one more time `phase` ran, e.g. `build` or `agent`, and adds how long it took on
 * the clock to the state's timings, whether it returns or throws.
 */
export async function timed<T>(deps: Pick<Dependencies, "clock" | "state">, phase: string, job: () => Promise<T>): Promise<T> {
  const startedAt = deps.clock.now();
  try {
    return await job();
  } finally {
    const ms = deps.clock.now() - startedAt;
    deps.state.update(updateRun((run) => recordTiming(run, phase, ms)));
  }
}
