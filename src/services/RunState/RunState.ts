/**
 * Where a run is in its lifecycle: queued, then running, then committing its image and uploading it.
 * A crash or a timeout is its own outcome, distinct from a run that finished and was committed.
 */
export type RunStatus = "queued" | "running" | "committing" | "committed" | "uploading" | "uploaded" | "crashed" | "timedOut";

/** Where a pre-run image is: checking the remote, pulling or building it, or done. */
export type ImageBuildStatus = "checking" | "pulling" | "building" | "ready" | "failed";

export type RunProgress = { readonly status: RunStatus };

/**
 * What an execution is doing, for a displayer to show. `M` is the manifest's type, which lives in a
 * higher layer than this one.
 */
export type RunState<M = unknown> = {
  readonly manifest?: M;
  /** By run ID. */
  readonly runs: Readonly<Record<string, RunProgress>>;
  /** By image reference. */
  readonly images: Readonly<Record<string, ImageBuildStatus>>;
  /** Committed images still waiting to upload. */
  readonly uploadBacklog: number;
};

/** Lower levels write to it only through `update`; a displayer reads it with `get`. */
export interface RunStateStore<M = unknown> {
  get(): RunState<M>;
  /** Replaces the state with what `fn` returns. `fn` must return a new object, never mutate. */
  update(fn: (s: RunState<M>) => RunState<M>): void;
}

export function emptyRunState<M = unknown>(): RunState<M> {
  return { runs: {}, images: {}, uploadBacklog: 0 };
}

/** In memory. Deterministic, so tests use it as is, with no fake. */
export function createRunStateStore<M = unknown>(initial: RunState<M> = emptyRunState<M>()): RunStateStore<M> {
  let state = initial;
  return {
    get: () => state,
    update: (fn) => {
      state = fn(state);
    },
  };
}

export function setRunStatus<M>(state: RunState<M>, runId: string, status: RunStatus): RunState<M> {
  return { ...state, runs: { ...state.runs, [runId]: { ...state.runs[runId], status } } };
}

export function setImageStatus<M>(state: RunState<M>, reference: string, status: ImageBuildStatus): RunState<M> {
  return { ...state, images: { ...state.images, [reference]: status } };
}

export function setUploadBacklog<M>(state: RunState<M>, backlog: number): RunState<M> {
  return { ...state, uploadBacklog: backlog };
}
