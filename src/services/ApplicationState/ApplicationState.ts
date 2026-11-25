/**
 * Where a run is in its lifecycle: queued, then running, then committing its image, measuring it
 * and uploading it. `finished` is a run that is committed and measured, with nothing left to do but
 * any upload. A crash, a timeout or being cancelled is its own outcome, distinct from a run that
 * finished.
 */
export type RunStatus =
  | "queued"
  | "running"
  | "committing"
  | "committed"
  | "measuring"
  | "uploading"
  | "uploaded"
  | "finished"
  | "crashed"
  | "timedOut"
  | "cancelled";

/** Where a pre-run image is: checking the remote, pulling or building it, or done. */
export type ImageBuildStatus = "checking" | "pulling" | "building" | "ready" | "failed";

/** One run, as a displayer shows it. Everything but its status is filled in as it becomes known. */
export type RunProgress = {
  readonly status: RunStatus;
  /** Epoch ms. */
  readonly startedAt?: number;
  readonly finishedAt?: number;
  /** How the agent ended, in a few words, e.g. `done`, `exited 2`, `timed out after 60s`. */
  readonly outcome?: string;
  readonly costUsd?: number;
  readonly tokens?: number;
  /** Its measures by name, each already formatted for showing. */
  readonly measures?: Readonly<Record<string, string>>;
  /** Why it didn't end cleanly. */
  readonly hint?: string;
  /** What went wrong, for a run that crashed. */
  readonly error?: string;
};

/** How far the command has got. */
export type RunPhase = "resolving" | "planned" | "building" | "running" | "done";

/** How long things took: the whole command, and each named phase over every time it ran. */
export type RunTimings = {
  readonly wallMs: number;
  readonly phases: Readonly<Record<string, { readonly count: number; readonly totalMs: number; readonly maxMs: number }>>;
};

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
  readonly phase?: RunPhase;
  readonly executionId?: string;
  /** Where the execution was recorded, e.g. the run data store's path. */
  readonly recordedIn?: string;
  /** The message of the error that stopped the command. */
  readonly failure?: string;
  readonly warnings?: readonly string[];
  /** Lines to show once the runs are over, e.g. secrets found. */
  readonly notes?: readonly string[];
  readonly timings?: RunTimings;
  /** What `--json` prints. Set once, at the end. */
  readonly result?: unknown;
  readonly exitCode?: number;
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

export function setImageStatus<M>(state: RunState<M>, reference: string, status: ImageBuildStatus): RunState<M> {
  return { ...state, images: { ...state.images, [reference]: status } };
}

export function setUploadBacklog<M>(state: RunState<M>, backlog: number): RunState<M> {
  return { ...state, uploadBacklog: backlog };
}

/**
 * Changes the fields of one run given in `patch`, keeping its others, e.g.
 * `patchRun(r, id, { status: "finished", outcome: "done" })`. A run not seen before starts `queued`.
 */
export function patchRun<M>(state: RunState<M>, runId: string, patch: Partial<RunProgress>): RunState<M> {
  return { ...state, runs: { ...state.runs, [runId]: { status: "queued", ...state.runs[runId], ...patch } } };
}

export function setPhase<M>(state: RunState<M>, phase: RunPhase): RunState<M> {
  return { ...state, phase };
}

/** Adds a warning, after the ones there. One already there isn't added again: a displayer shows each once. */
export function addWarning<M>(state: RunState<M>, warning: string): RunState<M> {
  if (state.warnings?.includes(warning)) return state;
  return { ...state, warnings: [...(state.warnings ?? []), warning] };
}

export function addNote<M>(state: RunState<M>, note: string): RunState<M> {
  return { ...state, notes: [...(state.notes ?? []), note] };
}

export function setFailure<M>(state: RunState<M>, failure: string): RunState<M> {
  return { ...state, failure };
}

/** Adds one more time `phase` took, `ms`, to the timings. The wall time is left as it is: 0 until set. */
export function recordTiming<M>(state: RunState<M>, phase: string, ms: number): RunState<M> {
  const timings = state.timings ?? { wallMs: 0, phases: {} };
  const before = timings.phases[phase] ?? { count: 0, totalMs: 0, maxMs: 0 };
  const after = { count: before.count + 1, totalMs: before.totalMs + ms, maxMs: Math.max(before.maxMs, ms) };
  return { ...state, timings: { ...timings, phases: { ...timings.phases, [phase]: after } } };
}
