/**
 * Where a run is in its lifecycle: queued, then running, then committing its image and uploading it.
 * A crash or a timeout is its own outcome, distinct from a run that finished and was committed.
 */
export type RunStatus = "queued" | "running" | "committing" | "committed" | "uploading" | "uploaded" | "crashed" | "timedOut";

/** Where a pre-run image is: checking the remote, pulling or building it, or done. */
export type ImageBuildStatus = "checking" | "pulling" | "building" | "ready" | "failed";

export type RunProgress = { readonly status: RunStatus };

/**
 * What an execution is doing. `M` is the manifest's type and `D` its details', which live in a
 * higher layer than this one.
 */
export type RunState<M = unknown, D = unknown> = {
  readonly manifest?: M;
  /** Whatever else the command keeps for its displayer, e.g. an ordered log of what happened. Absent until it's set. */
  readonly details?: D;
  /** By run ID. */
  readonly runs: Readonly<Record<string, RunProgress>>;
  /** By image reference. */
  readonly images: Readonly<Record<string, ImageBuildStatus>>;
  /** Committed images still waiting to upload. */
  readonly uploadBacklog: number;
};

/**
 * Everything the application is doing, for a displayer to show. One slice per concern; only the run
 * state so far.
 */
export type ApplicationState<M = unknown, D = unknown> = {
  readonly run: RunState<M, D>;
};

/** Lower levels write to it only through `update`; a displayer reads it with `get`. */
export interface ApplicationStateService<M = unknown, D = unknown> {
  get(): ApplicationState<M, D>;
  /** Replaces the state with what `fn` returns. `fn` must return a new object, never mutate. */
  update(fn: (s: ApplicationState<M, D>) => ApplicationState<M, D>): void;
}

export function emptyRunState<M = unknown, D = unknown>(): RunState<M, D> {
  return { runs: {}, images: {}, uploadBacklog: 0 };
}

export function emptyApplicationState<M = unknown, D = unknown>(): ApplicationState<M, D> {
  return { run: emptyRunState<M, D>() };
}

/** In memory. Built at an entry point; tests use FakeApplicationState. */
export function createApplicationStateService<M = unknown, D = unknown>(initial: ApplicationState<M, D> = emptyApplicationState<M, D>()): ApplicationStateService<M, D> {
  let state = initial;
  return {
    get: () => state,
    update: (fn) => {
      state = fn(state);
    },
  };
}

/** Lifts a change to the run state into a change to the application state. */
export function updateRun<M, D = unknown>(fn: (run: RunState<M, D>) => RunState<M, D>): (s: ApplicationState<M, D>) => ApplicationState<M, D> {
  return (s) => ({ ...s, run: fn(s.run) });
}

export function setRunStatus<M, D = unknown>(state: RunState<M, D>, runId: string, status: RunStatus): RunState<M, D> {
  return { ...state, runs: { ...state.runs, [runId]: { ...state.runs[runId], status } } };
}

export function setImageStatus<M, D = unknown>(state: RunState<M, D>, reference: string, status: ImageBuildStatus): RunState<M, D> {
  return { ...state, images: { ...state.images, [reference]: status } };
}

export function setUploadBacklog<M, D = unknown>(state: RunState<M, D>, backlog: number): RunState<M, D> {
  return { ...state, uploadBacklog: backlog };
}

/** Replaces the details with what `fn` returns, given the details so far, or undefined if none are set. */
export function setDetails<M, D>(state: RunState<M, D>, fn: (details: D | undefined) => D): RunState<M, D> {
  return { ...state, details: fn(state.details) };
}
