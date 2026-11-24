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
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import type { PlannedExecution } from "../../../execution/planExecution.ts";
import type { RunHooks } from "../../../execution/runExecution.ts";
import type { RecordedOutcome } from "../../../store/runDataStore.ts";
import type { Clock } from "../../../time/clock.ts";
import { label } from "./runDisplay.ts";

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

/** The state of `plan`'s execution, every container run queued, and the hooks that keep it up to date, on `clock`. */
export function trackRun(plan: PlannedExecution, testCase: TestCaseDeclaration, _clock: Clock): { state: RunState; hooks: RunHooks } {
  const permutations = plan.permutations.length;
  const state: RunState = {
    executionId: plan.executionId,
    containers: plan.permutations.flatMap((permutation) =>
      permutation.iterations.map((iteration) => ({
        permutation: [permutation.number, permutations] as [number, number],
        iteration: [iteration.number, testCase.iterations] as [number, number],
        label: label(testCase, permutation),
        run: { status: "queued" } as const,
      })),
    ),
  };
  return { state, hooks: {} };
}
