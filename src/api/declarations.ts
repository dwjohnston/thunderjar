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

/** What every fragment gets. */
export type FragmentCtx = {};

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

/** What a harness's `cli` gets, to build the command that runs the agent. */
export type HarnessCliCtx = {
  version: string;
  modelId: string;
  initialPrompt: string;
  /** Where the agent's own report of the run goes. */
  resultPath: string;
};

export type HarnessDeclaration<C = unknown> = Applies<C, HarnessApplyCtx> & {
  cli: (ctx: HarnessCliCtx) => string;
  /** Environment variables the agent needs, e.g. its API key. */
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

export type ModelTokenCosts = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd?: number;
};

export type TokenCosts =
  | { outcome: "collected"; models: ModelTokenCosts[] }
  | { outcome: "unavailable"; reason: "absent" | "unparseable" | "notReported" };

/** Reads the token costs from what the harness's `cli` wrote to its result path. */
export type TokenCostCollector = (raw: string, ctx: { version: string; modelId: string }) => TokenCosts;

export function declareTokenCostCollector(collector: TokenCostCollector): TokenCostCollector {
  return declared("declareTokenCostCollector", collector);
}

/**
 * An initial prompt is one file, not a folder, so its fragment has no `ctx.dir`. It is used when
 * the harness runs, so its fragment is usually left out.
 */
export type InitialPromptDeclaration<C = unknown> = Applies<C, FragmentCtx> & {
  prompt: string;
  timeoutSeconds: number;
};

export function declareInitialPrompt<C = undefined>(declaration: InitialPromptDeclaration<C>): InitialPromptDeclaration<C> {
  return declared("declareInitialPrompt", declaration);
}

export type MeasurementDeclaration = {
  instrument: string;
  config: unknown;
  /** How its values combine across iterations, e.g. `rate`. */
  aggregate: string[];
};

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
