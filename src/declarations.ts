// The `declareX()` functions a Thunderjar configuration file's default export is
// wrapped in — see spec/022-coding-conventions.md#declarex-functions-not-bare-exports.
// Each is the identity function on its argument; the point is the parameter type, which
// gives every `ctx` its shape with nothing written at the call site.
//
// `BaseImageName`, `CodeStateName`, `PromptSetName`, `TaskName`, `InitialPromptNames` and
// `HarnessModelName` are ambient globals with no import — see src/parameter-names.d.ts.

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
  return declaration;
}

// --- Code state: spec/062-code-state.md ---

interface CodeStateDeclaration extends HashOverrides {
  commit: string | ((ctx: ApplyParameterCtx) => string);
  applyParameter: (ctx: ApplyParameterCtx) => string;
}

export function declareCodeState(declaration: CodeStateDeclaration): CodeStateDeclaration {
  return declaration;
}

// --- Prompt set: spec/063-prompt-set.md ---

interface PromptSetDeclaration extends HashOverrides {
  commit: string | ((ctx: ApplyParameterCtx) => string);
  files: Record<string, string>;
  applyParameter: (ctx: ApplyParameterCtx) => string;
}

export function declarePromptSet(declaration: PromptSetDeclaration): PromptSetDeclaration {
  return declaration;
}

// --- Harness/model pair: spec/064-harness.md ---

interface HarnessApplyCtx {
  version: string;
  resolvedHash?: string;
}

interface HarnessCliCtx {
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

interface HarnessDeclaration {
  applyParameter: (ctx: HarnessApplyCtx) => string;
  cli: (ctx: HarnessCliCtx) => string;
  requiredEnv?: string[];
}

export function declareHarness(declaration: HarnessDeclaration): HarnessDeclaration {
  return declaration;
}

export function declareHarnessModels(models: Record<string, string>): Record<string, string> {
  return models;
}

type HarnessVersionEntry = ({ version: string } | { determineHash: () => string }) & HarnessExecutionOverrides;

export function declareHarnessVersions(
  versions: Record<string, HarnessVersionEntry>,
): Record<string, HarnessVersionEntry> {
  return versions;
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
  return collector;
}

// --- Initial prompt: spec/066-task.md#initial-prompts ---

interface InitialPromptDeclaration extends HashOverrides {
  prompt: string;
  timeoutSeconds: number;
  applyParameter: (ctx: ApplyParameterCtx) => string;
}

export function declareInitialPrompt(declaration: InitialPromptDeclaration): InitialPromptDeclaration {
  return declaration;
}

// --- Measurement: spec/060-test-case-parameters.md#measuring-instruments--measurements ---

interface MeasurementDeclaration {
  instrument: string;
  config: unknown;
}

export function declareMeasurement(declaration: MeasurementDeclaration): MeasurementDeclaration {
  return declaration;
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
  return declaration;
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
  return config;
}
