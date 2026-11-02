// The `declareX()` functions that a `.thunderjar/` file's default export is wrapped in. Each
// returns what it is given: the point is the type of its argument.
import type {
  BaseImageNames,
  CodeStateNames,
  HarnessModelNames,
  InitialPromptNamesByTask,
  PromptSetNames,
  TaskNames,
} from "./parameterNames.ts";

// Each declareX() marks what it returns with its own name, so the config loader can tell a wrapped
// default export from a bare one. Symbol.for, so the mark is recognised even when the user's
// project resolves a different copy of this module.
const DECLARED_BY = Symbol.for("thunderjar.declaredBy");

function declared<T extends object>(declareFn: string, value: T): T {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    Object.defineProperty(value, DECLARED_BY, { value: declareFn, configurable: true });
  }
  return value;
}

/** The name of the declareX() function `value` was returned from, if any. */
export function declaredBy(value: unknown): string | undefined {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
  const mark = (value as { [DECLARED_BY]?: unknown })[DECLARED_BY];
  return typeof mark === "string" ? mark : undefined;
}

// --- applyParameter ---
//
// Each parameter's `applyParameter(config, ctx)` returns the Dockerfile fragment that applies it
// to the prerun image; see src/execution/prerunDockerfile.ts for the order they are built in.
// `config` is the declaration's own `config`, as written (undefined if it has none).

/**
 * Reads the repository the project is in, without fetching. Each commit is a hash, full or
 * abbreviated, and must already be in the repository, or nothing is built.
 */
export type GitCtx = {
  /**
   * Puts `path`'s content at `commit` into the build context, and returns where it is there, to
   * COPY: `COPY ${ctx.git.show("e4f5a6", "prompts/snerk.md")} /workspace/CLAUDE.md`. `path` is
   * relative to the repository's root.
   */
  show(commit: string, path: string): string;
};

/** What every fragment gets. */
export type FragmentCtx = {
  git: GitCtx;
};

/**
 * What a fragment gets when its parameter is a folder. `dir` is that folder's path in the build
 * context, so files kept beside the declaration can be copied in: `COPY ${ctx.dir}/files/ /workspace/`.
 * It names the parameter's role, not its folder, so renaming the folder changes nothing.
 */
export type ApplyParameterCtx = FragmentCtx & {
  dir: string;
};

/**
 * A parameter declaration's `config`, and the `applyParameter` that receives it. A method, so a
 * declaration with any `config` is still a `XDeclaration<unknown>` once loaded.
 */
type Applies<C, Ctx> = {
  config?: C;
  applyParameter?(config: C, ctx: Ctx): string;
};

/** A base image's fragment is required: it carries the prerun image's `FROM`. */
export type BaseImageDeclaration<C = unknown> = Applies<C, ApplyParameterCtx> & {
  applyParameter(config: C, ctx: ApplyParameterCtx): string;
};

export function declareBaseImage<C = undefined>(declaration: BaseImageDeclaration<C>): BaseImageDeclaration<C> {
  return declared("declareBaseImage", declaration);
}

export type CodeStateDeclaration<C = unknown> = Applies<C, ApplyParameterCtx>;

export function declareCodeState<C = undefined>(declaration: CodeStateDeclaration<C>): CodeStateDeclaration<C> {
  return declared("declareCodeState", declaration);
}

export type PromptSetDeclaration<C = unknown> = Applies<C, ApplyParameterCtx>;

export function declarePromptSet<C = undefined>(declaration: PromptSetDeclaration<C>): PromptSetDeclaration<C> {
  return declared("declarePromptSet", declaration);
}

/** `dir` is the harness's folder; `version` is the pair's version, as its `versions.ts` entry gives it. */
export type HarnessApplyCtx = ApplyParameterCtx & {
  version: string;
};

/**
 * What a harness's `cli` gets, to build the command that runs the agent. An initial prompt of
 * several turns runs `cli` once per turn, in the same container, one after another.
 */
export type HarnessCliCtx = {
  version: string;
  modelId: string;
  /**
   * The turn's prompt text. Pasted into a shell command it breaks on the first quote, `$` or
   * backtick, so read `promptPath` instead.
   */
  initialPrompt: string;
  /**
   * A file in the container holding the turn's prompt, exactly, with no newline added: pass it to
   * the agent as `"$(cat ${ctx.promptPath})"`, or as a file if it takes one.
   */
  promptPath: string;
  /** Where the agent's own report of the turn goes. Each turn has its own. */
  resultPath: string;
  /** Which turn this is, counting from 0. A single prompt is turn 0. */
  turn: number;
  /**
   * A fresh UUID for each container run, the same for each of its turns: start the agent's
   * session with it on turn 0, and resume it on later turns, e.g. `--session-id`, then `--resume`.
   */
  sessionId: string;
};

export type HarnessDeclaration<C = unknown> = Applies<C, HarnessApplyCtx> & {
  cli: (ctx: HarnessCliCtx) => string;
  /**
   * The agent's final reply, read from the text of the result file its `cli` left, for
   * instruments such as `replyMatches` to measure. Without it, a run has no reply.
   */
  collectReply?: (raw: string) => string;
  /**
   * The names of the environment variables the agent needs, e.g. its API key. Each is passed into
   * this harness's containers only, as `docker run -e NAME`, so its value comes from the shell that
   * runs Thunderjar, and is never written down. `plan` and `run` stop if one is unset.
   */
  requiredEnv?: string[];
};

export function declareHarness<C = undefined>(declaration: HarnessDeclaration<C>): HarnessDeclaration<C> {
  return declared("declareHarness", declaration);
}

/** A harness's models: the name a test case uses, to the ID the agent is given. */
export type HarnessModelsDeclaration = Record<string, string>;

export function declareHarnessModels(models: HarnessModelsDeclaration): HarnessModelsDeclaration {
  return declared("declareHarnessModels", models);
}

/** A harness's versions, by the name a test case uses. */
export type HarnessVersionsDeclaration = Record<string, { version: string }>;

export function declareHarnessVersions(versions: HarnessVersionsDeclaration): HarnessVersionsDeclaration {
  return declared("declareHarnessVersions", versions);
}

/** One model's tokens, in four buckets priced differently, and its cost if the harness reports one. */
export type ModelTokenCosts = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** The harness's own estimate, never computed by Thunderjar. Absent if it reports none. */
  costUsd?: number;
  /** How far to trust `costUsd`: `unknown` when the harness's price table didn't know the model. */
  costBasis?: "list" | "managed" | "unknown";
};

/**
 * A container run's token costs, per model, or why there are none: no result file (`absent`), one
 * that couldn't be read (`unparseable`), or one that counted nothing (`notReported`).
 */
export type TokenCosts =
  | { outcome: "collected"; models: ModelTokenCosts[]; /** Time spent waiting on the model, if the harness reports it. */ apiDurationMs?: number }
  | { outcome: "unavailable"; reason: "absent" | "unparseable" | "notReported" };

/**
 * Reads the token costs from what the harness's `cli` wrote to its result path. Thunderjar calls
 * it only for a result file that exists, once per turn, and sums them. A throw is `unparseable`.
 */
export type TokenCostCollector = (raw: string, ctx: { version: string; modelId: string }) => TokenCosts;

export function declareTokenCostCollector(collector: TokenCostCollector): TokenCostCollector {
  return declared("declareTokenCostCollector", collector);
}

/**
 * An initial prompt is one file, not a folder, so its fragment has no `ctx.dir`. It is used when
 * the harness runs, so its fragment is usually left out.
 *
 * It's a single `prompt`, or a list of `turns`, each run by the harness's `cli` in turn, in the
 * same container and agent session, so a later turn can ask about an earlier one. Its
 * `timeoutSeconds` covers every turn together.
 */
export type InitialPromptDeclaration<C = unknown> = Applies<C, FragmentCtx> & {
  timeoutSeconds: number;
} & ({ prompt: string; turns?: never } | { turns: string[]; prompt?: never });

export function declareInitialPrompt<C = undefined>(declaration: InitialPromptDeclaration<C>): InitialPromptDeclaration<C> {
  return declared("declareInitialPrompt", declaration);
}

// --- Measurements ---

/** What an instrument gives for one measurement of one container run. */
export type MeasurementResult<T> =
  | { outcome: "measured"; data: T }
  /** Nothing to measure, e.g. no file matched. */
  | { outcome: "skipped"; reason?: string }
  /** The instrument itself failed. */
  | { outcome: "erroredWhileMeasuring"; error: Error };

/**
 * What an instrument runs against: a measurement container, started from a container run's
 * postrun image, and discarded once the measure is taken. Relative paths, glob patterns and
 * commands resolve in `workdir`.
 */
export type MeasurementContext = {
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  /** The files matching `pattern`, relative to `workdir`, sorted. */
  glob(pattern: string): Promise<string[]>;
  /** The text of the result file the harness's `cli` left, or "" if it left none. */
  harnessResult: string;
  /** The agent's final reply, from its harness's `collectReply`, or why there's none. */
  reply: Reply;
  /** Its reply to each turn, in order: one, unless its initial prompt has several turns. */
  replies: Reply[];
  workdir: string;
};

/** The agent's final reply, as its harness's `collectReply` read it from the result file, or why there's none. */
export type Reply = { outcome: "collected"; text: string } | { outcome: "unavailable"; reason: string };

/** Each built-in instrument's config and value, by name. */
export type InstrumentTypes = {
  /** Did the agent leave a file matching `glob`? */
  fileCreated: { config: { glob: string }; value: boolean };
  /** How many lines, across the files matching `glob`, match `pattern`, a JavaScript regular expression? */
  grep: { config: { glob: string; pattern: string }; value: number };
  /**
   * How many tests pass and fail when `template`, a path relative to the measurement's file, is
   * rendered against each file matching `subject` and run with `bun test`?
   */
  templateTest: { config: { subject: string; template: string }; value: { passed: number; failed: number } };
  /**
   * Does the agent's reply match `pattern`, a JavaScript regular expression? Its reply to `turn`,
   * counting from 1, of an initial prompt of several turns, or by default its last.
   */
  replyMatches: { config: { pattern: string; turn?: number }; value: boolean };
};

export type InstrumentName = keyof InstrumentTypes;

/** The ways values of type `T` can combine across iterations. */
export type AggregateFor<T> = [T] extends [boolean]
  ? "rate" | "count"
  : [T] extends [number]
    ? "mean" | "median" | "min" | "max" | "sum"
    : [T] extends [Record<string, number>]
      ? "sum" | "mean"
      : never;

/** An instrument and its config: a `config` that doesn't fit the instrument is a type error. */
export type MeasurementDeclaration = {
  [I in InstrumentName]: {
    instrument: I;
    config: InstrumentTypes[I]["config"];
    /** How its values combine across iterations, e.g. `rate`. */
    aggregate: AggregateFor<InstrumentTypes[I]["value"]>[];
  };
}[InstrumentName];

export function declareMeasurement(declaration: MeasurementDeclaration): MeasurementDeclaration {
  return declared("declareMeasurement", declaration);
}

/**
 * Every name must be declared under `test-case-parameters/`, and each initial prompt must be one of
 * `task`'s, once `thunderjar generate` has run.
 */
export type TestCaseDeclaration<T extends TaskNames = TaskNames> = {
  baseImage: BaseImageNames[];
  codeState: CodeStateNames[];
  promptSet: PromptSetNames[];
  harnessModel: HarnessModelNames[];
  task: T;
  initialPrompt: (T extends keyof InitialPromptNamesByTask ? InitialPromptNamesByTask[T] : never)[];
  iterations: number;
};

export function declareTestCase<T extends TaskNames>(declaration: TestCaseDeclaration<T>): TestCaseDeclaration<T> {
  return declared("declareTestCase", declaration);
}

export type SqliteStore = { kind: "sqlite"; path: string };

export function sqliteStore(options: { path: string }): SqliteStore {
  return { kind: "sqlite", ...options };
}

export type ConfigDeclaration = {
  imageStore: { repository: string };
  runDataStore: SqliteStore;
};

export function declareConfig(config: ConfigDeclaration): ConfigDeclaration {
  return declared("declareConfig", config);
}
