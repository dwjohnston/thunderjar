/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// How the levels of `runNext` write to the run state. Nothing here prints: the displayer reads the state.
import type { Phase } from "../../execution/timings.ts";
import { type ImageBuildStatus, type RunStatus, setDetails, setImageStatus, setRunStatus, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import type { Dependencies, RunDetails, RunEvent, RunMode, RunStateOf } from "../types.ts";

type Writes = Pick<Dependencies, "state" | "clock">;

/** A distributive Omit, so each member of a union keeps its own fields. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export const emptyDetails = (mode: RunMode, startedAt: number): RunDetails => ({ mode, startedAt, log: [], phases: {} });

/** The details, or empty ones if a level below `runTestCase` is run on its own, e.g. by a test. */
export const detailsOf = (run: RunStateOf, now = 0): RunDetails => run.details ?? emptyDetails("full", now);

const changeDetails = ({ state, clock }: Writes, change: (details: RunDetails) => RunDetails): void =>
  state.update(updateRun((run) => setDetails(run, (details) => change(details ?? emptyDetails("full", clock.now())))));

/** Adds `event` to the log, dated now. */
export function logEvent(deps: Writes, event: Without<RunEvent, "at">): void {
  const dated = { ...event, at: deps.clock.now() } as RunEvent;
  changeDetails(deps, (details) => ({ ...details, log: [...details.log, dated] }));
}

export const setRun = ({ state }: Pick<Dependencies, "state">, runId: string, status: RunStatus): void =>
  state.update(updateRun((run) => setRunStatus(run, runId, status)));

export const setImage = ({ state }: Pick<Dependencies, "state">, image: string, status: ImageBuildStatus): void =>
  state.update(updateRun((run) => setImageStatus(run, image, status)));

/** Runs `job` as one run of `phase`, adding how long it took to the state's timings, whether it returns or throws. */
export async function timed<T>(deps: Writes, phase: Phase, job: () => Promise<T>): Promise<T> {
  const start = deps.clock.now();
  try {
    return await job();
  } finally {
    const ms = deps.clock.now() - start;
    changeDetails(deps, (details) => {
      const before = details.phases[phase] ?? { count: 0, totalMs: 0, maxMs: 0 };
      return { ...details, phases: { ...details.phases, [phase]: { count: before.count + 1, totalMs: before.totalMs + ms, maxMs: Math.max(before.maxMs, ms) } } };
    });
  }
}

export const changeRunDetails = changeDetails;
