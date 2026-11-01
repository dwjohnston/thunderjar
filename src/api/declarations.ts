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

// Its arguments get their types once thunderjar applies parameters.
type ApplyParameter = (config: any, ctx: any) => string;

type ParameterDeclaration = {
  applyParameter?: ApplyParameter;
};

export type BaseImageDeclaration = ParameterDeclaration;

export function declareBaseImage(declaration: BaseImageDeclaration): BaseImageDeclaration {
  return declared("declareBaseImage", declaration);
}

export type CodeStateDeclaration = ParameterDeclaration;

export function declareCodeState(declaration: CodeStateDeclaration): CodeStateDeclaration {
  return declared("declareCodeState", declaration);
}

export type PromptSetDeclaration = ParameterDeclaration;

export function declarePromptSet(declaration: PromptSetDeclaration): PromptSetDeclaration {
  return declared("declarePromptSet", declaration);
}

/** What a harness's `cli` gets, to build the command that runs the agent. */
export type HarnessCliCtx = {
  version: string;
  modelId: string;
  initialPrompt: string;
  /** Where the agent's own report of the run goes. */
  resultPath: string;
};

export type HarnessDeclaration = ParameterDeclaration & {
  cli: (ctx: HarnessCliCtx) => string;
  /** Environment variables the agent needs, e.g. its API key. */
  requiredEnv?: string[];
};

export function declareHarness(declaration: HarnessDeclaration): HarnessDeclaration {
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

export type InitialPromptDeclaration = ParameterDeclaration & {
  prompt: string;
  timeoutSeconds: number;
};

export function declareInitialPrompt(declaration: InitialPromptDeclaration): InitialPromptDeclaration {
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
