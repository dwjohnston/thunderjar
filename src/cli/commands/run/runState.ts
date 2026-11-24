/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
// What `run` is doing, as data: each container run of its execution, and where it is. run
// publishes it, for `app.state()`, and renderRun draws it.
import type { RecordedOutcome } from "../../../store/runDataStore.ts";

/** A container run's measures, by name. */
export type Measures = Record<string, RecordedOutcome>;

/** Where one container run is. Times are the clock's, in epoch ms. */
export type ContainerRunState =
  | { status: "queued" }
  /** Its container is being started; its agent hasn't. Its timeout doesn't run yet. */
  | { status: "starting"; since: number }
  /** Its agent is running, and its timeout counting. */
  | { status: "running"; since: number }
  | { status: "failedToStart"; reason: string }
  | { status: "timedOut"; timeoutSeconds: number; ms: number; measures?: Measures }
  /** Its agent exited non-zero. */
  | { status: "exited"; exitCode: number; resultFile: boolean; ms: number; measures?: Measures }
  /** Its agent exited 0. */
  | { status: "done"; resultFile: boolean; ms: number; measures?: Measures };

/** One container run: which permutation and iteration it is, of how many, and where it is. */
export type ContainerState = {
  permutation: [number, number];
  iteration: [number, number];
  /** What tells its permutation apart, e.g. `fake-sleeper | plain`. */
  label: string;
  run: ContainerRunState;
};

export type RunState = { executionId: string; containers: ContainerState[] };
