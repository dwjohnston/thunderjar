import type { ContainerRunRecord, ExecutionRecord } from "../RunDataStore/RunDataStore.ts";

/**
 * Where a run is in its lifecycle: queued, then running, then committing its image and uploading it.
 * A crash or a timeout is its own outcome, distinct from a run that finished and was committed.
 */
export type RunStatus = "queued" | "running" | "committing" | "committed" | "uploading" | "uploaded" | "crashed" | "timedOut";

/** Where a pre-run image is: checking the remote, pulling it, or building and pushing it, or done. */
export type ImageBuildStatus = "checking" | "pulling" | "building" | "pushing" | "ready" | "failed";

/** Whether a run's measurements are being taken, or have been. Absent if it has none, or isn't measured. */
export type MeasuringStatus = "measuring" | "measured";

export type RunProgress = {
  readonly status: RunStatus;
  /** Epoch ms, when its container was started, and when its agent stopped. */
  readonly startedAt?: number;
  readonly finishedAt?: number;
  readonly measuring?: MeasuringStatus;
  /** Its record, as the run data store has it, once it has stopped. */
  readonly record?: ContainerRunRecord;
  /** Why it crashed, or why its postrun image wasn't uploaded. */
  readonly error?: string;
};

/** One phase's total: how many times it ran, how long they took together, and the longest. */
export type PhaseTotal = { readonly count: number; readonly totalMs: number; readonly maxMs: number };

/**
 * What an execution is doing. `M` is the manifest's type, which lives in a higher layer than this one.
 */
export type RunState<M = unknown> = {
  readonly manifest?: M;
  /** By run ID. */
  readonly runs: Readonly<Record<string, RunProgress>>;
  /** By image reference. */
  readonly images: Readonly<Record<string, ImageBuildStatus>>;
  /** Committed images still waiting to upload. */
  readonly uploadBacklog: number;
  /** How far the command goes: absent for a full run. */
  readonly mode?: "dry-run" | "build-only";
  /** The execution, as the run data store has it, once its first run starts. */
  readonly execution?: ExecutionRecord;
  /** Where the run data store is. */
  readonly recordedIn?: string;
  /** How long each phase has taken, by its name. */
  readonly timings?: Readonly<Record<string, PhaseTotal>>;
  /** Whether the displayer shows `timings`. */
  readonly showTimings?: boolean;
  /** What the user should know besides: a line each. */
  readonly notes?: readonly string[];
  /** Why it stopped, if it stopped on an error. */
  readonly error?: string;
};

/**
 * Everything the application is doing, for a displayer to show. One slice per concern; only the run
 * state so far.
 */
export type ApplicationState<M = unknown> = {
  readonly run: RunState<M>;
};

/** Lower levels write to it only through `update`; a displayer reads it with `get`. */
export interface ApplicationStateService<M = unknown> {
  get(): ApplicationState<M>;
  /** Replaces the state with what `fn` returns. `fn` must return a new object, never mutate. */
  update(fn: (s: ApplicationState<M>) => ApplicationState<M>): void;
}

export function emptyRunState<M = unknown>(): RunState<M> {
  return { runs: {}, images: {}, uploadBacklog: 0 };
}

export function emptyApplicationState<M = unknown>(): ApplicationState<M> {
  return { run: emptyRunState<M>() };
}

/** In memory. Built at an entry point; tests use FakeApplicationState. */
export function createApplicationStateService<M = unknown>(initial: ApplicationState<M> = emptyApplicationState<M>()): ApplicationStateService<M> {
  let state = initial;
  return {
    get: () => state,
    update: (fn) => {
      state = fn(state);
    },
  };
}

/** Lifts a change to the run state into a change to the application state. */
export function updateRun<M>(fn: (run: RunState<M>) => RunState<M>): (s: ApplicationState<M>) => ApplicationState<M> {
  return (s) => ({ ...s, run: fn(s.run) });
}

export function setRunStatus<M>(state: RunState<M>, runId: string, status: RunStatus): RunState<M> {
  return { ...state, runs: { ...state.runs, [runId]: { ...state.runs[runId], status } } };
}

/** Merges `progress` into what's known of run `runId`. A run not yet known starts `queued`. */
export function patchRun<M>(state: RunState<M>, runId: string, progress: Partial<RunProgress>): RunState<M> {
  return { ...state, runs: { ...state.runs, [runId]: { status: "queued", ...state.runs[runId], ...progress } } };
}

/** Adds one run of `phase`, which took `ms`, to the timings. */
export function addTiming<M>(state: RunState<M>, phase: string, ms: number): RunState<M> {
  const before = state.timings?.[phase] ?? { count: 0, totalMs: 0, maxMs: 0 };
  return { ...state, timings: { ...state.timings, [phase]: { count: before.count + 1, totalMs: before.totalMs + ms, maxMs: Math.max(before.maxMs, ms) } } };
}

export function addNote<M>(state: RunState<M>, note: string): RunState<M> {
  return { ...state, notes: [...(state.notes ?? []), note] };
}

export function setImageStatus<M>(state: RunState<M>, reference: string, status: ImageBuildStatus): RunState<M> {
  return { ...state, images: { ...state.images, [reference]: status } };
}

export function setUploadBacklog<M>(state: RunState<M>, backlog: number): RunState<M> {
  return { ...state, uploadBacklog: backlog };
}
