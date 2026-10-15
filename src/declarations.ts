// The `declareX()` functions a Thunderjar configuration file's default export is
// wrapped in — see spec/022-coding-conventions.md#declarex-functions-not-bare-exports.
// Each is the identity function on its argument; the point is the parameter type, which
// gives every `ctx` its shape with nothing written at the call site.
//
// `BaseImageName`, `CodeStateName`, `PromptSetName`, `TaskName`, `InitialPromptNames` and
// `HarnessModelName` are ambient globals with no import — see src/parameter-names.d.ts.

// Each declareX() marks what it returns with its own name, so the config loader can tell
// a wrapped default export from a bare one. Symbol.for, so the mark is recognised even
// when the user's project resolves a different copy of this module.
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

interface ApplyParameterCtx {
  resolvedHash?: string;
}

// spec/060-test-case-parameters.md#controlling-the-parameter-hash
interface HashOverrides {
  additionalHash?: () => string;
  determineHash?: () => string;
}

// --- Base image: spec/061-base-image.md ---

interface BaseImageDeclaration extends HashOverrides {
  applyParameter: (ctx: ApplyParameterCtx) => string;
}

export function declareBaseImage(declaration: BaseImageDeclaration): BaseImageDeclaration {
  return declared("declareBaseImage", declaration);
}

// --- Code state: spec/062-code-state.md ---

interface CodeStateDeclaration extends HashOverrides {
  commit: string | ((ctx: ApplyParameterCtx) => string);
  applyParameter: (ctx: ApplyParameterCtx) => string;
}

export function declareCodeState(declaration: CodeStateDeclaration): CodeStateDeclaration {
  return declared("declareCodeState", declaration);
}

// --- Prompt set: spec/063-prompt-set.md ---

interface PromptSetDeclaration extends HashOverrides {
  commit: string | ((ctx: ApplyParameterCtx) => string);
  files: Record<string, string>;
  applyParameter: (ctx: ApplyParameterCtx) => string;
}

export function declarePromptSet(declaration: PromptSetDeclaration): PromptSetDeclaration {
  return declared("declarePromptSet", declaration);
}

// --- Harness/model pair: spec/064-harness.md ---

interface HarnessApplyCtx {
  version: string;
  resolvedHash?: string;
}

export interface HarnessCliCtx {
  version: string;
  modelId: string;
  initialPrompt: string;
  resultPath: string;
}

interface HarnessExecutionOverrides {
  applyParameter?: (ctx: HarnessApplyCtx) => string;
  cli?: (ctx: HarnessCliCtx) => string;
  requiredEnv?: string[];
}

export interface HarnessDeclaration {
  applyParameter: (ctx: HarnessApplyCtx) => string;
  cli: (ctx: HarnessCliCtx) => string;
  requiredEnv?: string[];
}

export function declareHarness(declaration: HarnessDeclaration): HarnessDeclaration {
  return declared("declareHarness", declaration);
}

export function declareHarnessModels(models: Record<string, string>): Record<string, string> {
  return declared("declareHarnessModels", models);
}

export type HarnessVersionEntry = ({ version: string } | { determineHash: () => string }) & HarnessExecutionOverrides;

export function declareHarnessVersions(
  versions: Record<string, HarnessVersionEntry>,
): Record<string, HarnessVersionEntry> {
  return declared("declareHarnessVersions", versions);
}

// spec/087-collecting-token-costs.md#normalising-collecttokencosts
interface CollectorContext {
  version: string;
  modelId: string;
}

interface ModelTokenCosts {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd?: number;
  costBasis?: "list" | "managed" | "unknown";
}

type TokenCosts =
  | { outcome: "collected"; models: ModelTokenCosts[]; apiDurationMs?: number }
  | { outcome: "unavailable"; reason: "absent" | "unparseable" | "notReported" };

type TokenCostCollector = (raw: string, ctx: CollectorContext) => TokenCosts;

export function declareTokenCostCollector(collector: TokenCostCollector): TokenCostCollector {
  return declared("declareTokenCostCollector", collector);
}

// --- Initial prompt: spec/066-task.md#initial-prompts ---

export interface InitialPromptDeclaration extends HashOverrides {
  prompt: string;
  timeoutSeconds: number;
  applyParameter: (ctx: ApplyParameterCtx) => string;
}

export function declareInitialPrompt(declaration: InitialPromptDeclaration): InitialPromptDeclaration {
  return declared("declareInitialPrompt", declaration);
}

// --- Measurement: spec/060-test-case-parameters.md#measuring-instruments--measurements ---

/** What an instrument's `evaluate` gives for one measurement of one container run. */
export type MeasurementResult<T> =
  | { outcome: "measured"; data: T }
  | { outcome: "skipped" } // e.g. no output existed to check
  | { outcome: "erroredWhileMeasuring"; error: Error }; // the instrument itself threw

/**
 * What an instrument runs against: the postrun state of one container run —
 * spec/060-test-case-parameters.md#measurement-context. Relative paths and glob patterns
 * resolve in `workdir`.
 */
export interface MeasurementContext {
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  /** Files matching `pattern`, relative to `workdir`, sorted. */
  glob(pattern: string): Promise<string[]>;
  /** Raw contents of the file the harness's `cli` wrote. */
  harnessResult: string;
  workdir: string;
}

/**
 * The built-in instruments' config and value types, by name. src/instruments.ts implements
 * each against exactly these types.
 */
export interface InstrumentTypes {
  /** Did the agent leave a file matching `glob`? */
  fileCreated: { config: { glob: string }; value: boolean };
}

export type InstrumentName = keyof InstrumentTypes;

/** The ways a value type's measures can combine — spec/085-test-case-results.md#how-a-measures-values-combine. */
export type AggregateFor<T> = [T] extends [boolean]
  ? "rate" | "count"
  : [T] extends [number]
    ? "mean" | "median" | "min" | "max" | "sum"
    : [T] extends [Record<string, number>]
      ? "sum" | "mean"
      : never;

/** An instrument plus its config, typed by the instrument: a `config` that doesn't fit it is a type error. */
export type MeasurementDeclaration = {
  [I in InstrumentName]: {
    instrument: I;
    config: InstrumentTypes[I]["config"];
    /** How this measurement's values combine across iterations. Not applied yet. */
    aggregate: AggregateFor<InstrumentTypes[I]["value"]>[];
  };
}[InstrumentName];

export function declareMeasurement(declaration: MeasurementDeclaration): MeasurementDeclaration {
  return declared("declareMeasurement", declaration);
}

// --- Test case: spec/055-declaring-test-cases.md ---

export interface TestCaseDeclaration<T extends TaskName = TaskName> {
  baseImage: BaseImageName[];
  codeState: CodeStateName[];
  promptSet: PromptSetName[];
  harnessModel: HarnessModelName[];
  task: T;
  initialPrompt: Array<T extends keyof InitialPromptNames ? InitialPromptNames[T] : never>;
  iterations: number;
}

export function declareTestCase<T extends TaskName>(declaration: TestCaseDeclaration<T>): TestCaseDeclaration<T> {
  return declared("declareTestCase", declaration);
}

// --- Global config: spec/050-setup-and-configure.md#thunderjarconfigts ---

interface SqliteStoreOptions {
  path: string;
}

export function sqliteStore(options: SqliteStoreOptions): { kind: "sqlite" } & SqliteStoreOptions {
  return { kind: "sqlite", ...options };
}

interface ThunderjarConfigDeclaration {
  imageStore: { repository: string };
  runDataStore: ReturnType<typeof sqliteStore>;
}

export function declareConfig(config: ThunderjarConfigDeclaration): ThunderjarConfigDeclaration {
  return declared("declareConfig", config);
}
