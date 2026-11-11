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
export type FragmentCtx = Record<never, never>;

/**
 * What a fragment gets when its parameter is a folder. `dir` is where the folder's `files/` folder
 * is in the build context, so the files kept there can be copied in: `COPY ${ctx.dir}/ /workspace/`,
 * or `COPY ${ctx.dir}/scripts/ /opt/agent/` for `files/scripts/`. Nothing else of the folder is in the
 * build context, not even its `index.ts`, and nothing of any other parameter's folder.
 * It names the parameter's role, not its folder, so renaming the folder changes nothing.
 */
export type ApplyParameterCtx = FragmentCtx & {
  dir: string;
};

/** What `resolve` gets, to look up what a floating parameter currently means. */
export type ResolveCtx = {
  /**
   * Runs `command` with `sh -c` on the host, in the root of the repository the project is in (or
   * the project's folder, outside one). Returns its stdout, trimmed. Throws on a non-zero exit.
   */
  exec(command: string): Promise<string>;
};

/** What `resolve` can return: anything JSON can hold, so it can be recorded with each run. */
export type Resolved = string | number | boolean | null | Resolved[] | { [key: string]: Resolved };

/**
 * @docs
 * @kind heading
 * @name Shared parameter options
 * @description
 * `declareBaseImage`, `declareCodeState`, `declarePromptSet`, `declareHarness` and
 * `declareInitialPrompt` all take these.
 */

/**
 * A parameter declaration's `config`, its optional `resolve`, and the `applyParameter` that
 * receives them. Methods, so a declaration with any `config` is still a `XDeclaration<unknown>`
 * once loaded.
 *
 * `resolve` is for a floating parameter, such as a branch's latest commit. Thunderjar calls it on
 * the host, once per execution (`plan`, `run`, `build`), before anything is hashed, and passes its
 * result to `applyParameter` as `ctx.resolved`, and to a harness's `cli`. It must only read: a `git
 * fetch` is fine, building or writing anything isn't. It isn't hashed itself: only the text it ends
 * up in is, so a value no fragment uses changes nothing. Each run records it beside the parameter.
 * Declare it before `applyParameter`, so `ctx.resolved`'s type is inferred from it.
 */
type Applies<C, Ctx, R> = {
  /**
   * @docs
   * @name config
   * @type {C}
   * @default undefined
   * @description
   * Values passed to `resolve` and `applyParameter`, as written.
   */
  config?: C;
  /**
   * @docs
   * @name resolve
   * @type {(config: C, ctx: { exec(command: string): Promise<string> }) => Resolved | Promise<Resolved>}
   * @description
   * Looks up what a floating parameter currently means, such as a branch's latest commit. Runs on
   * the host once per `plan`, `run` or `build`, and must only read. Its result is passed on as
   * `ctx.resolved`, and recorded with each run.
   *
   * ```ts
   * resolve: (config, ctx) => ctx.exec(`git ls-remote ${config.repo} main | cut -f1`),
   * ```
   */
  resolve?(config: C, ctx: ResolveCtx): R | Promise<R>;
  /**
   * @docs
   * @name applyParameter
   * @type {(config: C, ctx: { dir: string; resolved: R }) => string}
   * @description
   * Returns the Dockerfile fragment that applies the parameter to the prerun image. `ctx.dir` is
   * where the parameter folder's `files/` folder is in the build context.
   *
   * ```ts
   * applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/`,
   * ```
   */
  applyParameter?(config: C, ctx: Ctx & { resolved: R }): string;
};

/** What a declaration's `resolve` returns, or undefined if it has none. */
type ResolvedOf = Resolved | undefined;

/**
 * @docs
 * @kind heading
 * @name declareBaseImage
 * @file parameters/baseImages/<name>/index.ts
 * @description
 * The image the agent runs in. Its `applyParameter` is required, and must start with `FROM`.
 *
 * ```ts
 * export default declareBaseImage({
 *   applyParameter: () => `FROM node:20-bookworm
 * RUN npm install --global bun@1.3.14`,
 * });
 * ```
 */

/** A base image's fragment is required: it carries the prerun image's `FROM`. */
export type BaseImageDeclaration<C = unknown, R = unknown> = Applies<C, ApplyParameterCtx, R> & {
  applyParameter(config: C, ctx: ApplyParameterCtx & { resolved: R }): string;
  /**
   * @docs
   * @name runOptions
   * @type {string[]}
   * @default []
   * @description
   * More `docker run` options for the agent's containers, for agents that need more of the
   * kernel than Docker allows by default, e.g. Claude Code's bubblewrap sandbox, which needs user
   * namespaces: `["--security-opt", "seccomp=unconfined", "--security-opt", "apparmor=unconfined"]`.
   * Each option and value is its own string. Ask for the least you need: `--privileged` works, but
   * gives the agent the whole machine.
   *
   * Some hosts forbid what no option can allow. Ubuntu 23.10 and later stop unconfined processes
   * making user namespaces until `sysctl kernel.apparmor_restrict_unprivileged_userns=0`.
   */
  runOptions?: string[];
};

export function declareBaseImage<C = undefined, R extends ResolvedOf = undefined>(declaration: BaseImageDeclaration<C, R>): BaseImageDeclaration<C, R> {
  return declared("declareBaseImage", declaration);
}

/**
 * @docs
 * @kind heading
 * @name declareCodeState
 * @file parameters/codeStates/<name>/index.ts
 * @description
 * What is in `/workspace` when the agent starts. Takes only the shared options.
 *
 * ```ts
 * export default declareCodeState({
 *   config: { repo: "https://github.com/acme/app.git", commit: "a1b2c3d" },
 *   applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
 *     && git -C /workspace checkout --quiet --detach ${config.commit}`,
 * });
 * ```
 */
export type CodeStateDeclaration<C = unknown, R = unknown> = Applies<C, ApplyParameterCtx, R>;

export function declareCodeState<C = undefined, R extends ResolvedOf = undefined>(declaration: CodeStateDeclaration<C, R>): CodeStateDeclaration<C, R> {
  return declared("declareCodeState", declaration);
}

/**
 * @docs
 * @kind heading
 * @name declarePromptSet
 * @file parameters/promptSets/<name>/index.ts
 * @description
 * The `AGENTS.md`, skills and other prompt files the agent sees. Takes only the shared options.
 *
 * ```ts
 * export default declarePromptSet({
 *   applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/`,
 * });
 * ```
 */
export type PromptSetDeclaration<C = unknown, R = unknown> = Applies<C, ApplyParameterCtx, R>;

export function declarePromptSet<C = undefined, R extends ResolvedOf = undefined>(declaration: PromptSetDeclaration<C, R>): PromptSetDeclaration<C, R> {
  return declared("declarePromptSet", declaration);
}

/** `dir` is where the harness's `files/` folder is; `version` is the harness's own `version`. */
export type HarnessApplyCtx = ApplyParameterCtx & {
  version: string;
};

/**
 * What a harness's `cli` gets, to build the command that runs the agent. An initial prompt of
 * several turns runs `cli` once per turn, in the same container, one after another.
 */
export type HarnessCliCtx = {
  /** The harness's own `version`. */
  version: string;
  /** The model ID the test case's pair names, `<harness>/<model ID>`, as the agent is given it. */
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

/**
 * @docs
 * @kind heading
 * @name declareHarness
 * @file parameters/harnessModels/<harness>/index.ts
 * @description
 * How to install and run an agent. Takes the shared options too.
 */
export type HarnessDeclaration<C = unknown, R = unknown> = Applies<C, HarnessApplyCtx, R> & {
  /**
   * @docs
   * @name version
   * @type {string}
   * @description
   * **Required.** The version of the agent this harness installs, e.g. `"2.1.311"`: `ctx.version` for its
   * fragment and `cli`. One harness folder pins one version, so name the folder after it, e.g.
   * `claude-code-2.1.311/`, and copy the folder to try another.
   */
  version: string;
  /**
   * @docs
   * @name cli
   * @type {(ctx: HarnessCliCtx) => string}
   * @description
   * **Required.** The command that runs the agent for one turn. `ctx` has `version`, `modelId`,
   * `initialPrompt`, `promptPath`, `resultPath`, `turn`, `sessionId`, and `resolved`, what
   * `resolve` returned.
   *
   * ```ts
   * cli: (ctx) => `claude -p "$(cat ${ctx.promptPath})" --model ${ctx.modelId} > ${ctx.resultPath}`,
   * ```
   */
  cli(ctx: HarnessCliCtx & { resolved: R }): string;
  /**
   * @docs
   * @name collectReply
   * @type {(raw: string) => string}
   * @description
   * The agent's final reply, read from the text of the result file its `cli` left, for
   * instruments such as `replyMatches` to measure. Without it, a run has no reply.
   */
  collectReply?: (raw: string) => string;
  /**
   * @docs
   * @name collectTokenCosts
   * @type {(raw: string, ctx: { version: string; modelId: string }) => TokenCosts}
   * @description
   * The run's token costs, read from the text of each turn's result file, once per turn, and
   * summed. A throw is `unparseable`. Without it, every run's are `notReported`.
   */
  collectTokenCosts?: TokenCostCollector;
  /**
   * @docs
   * @name requiredEnv
   * @type {string[]}
   * @description
   * The names of the environment variables the agent needs, e.g. its API key. Each is passed into
   * this harness's containers only, as `docker run -e NAME`, so its value comes from the shell that
   * runs Thunderjar, and is never written down. `plan` and `run` stop if one is unset.
   */
  requiredEnv?: string[];
};

export function declareHarness<C = undefined, R extends ResolvedOf = undefined>(declaration: HarnessDeclaration<C, R>): HarnessDeclaration<C, R> {
  return declared("declareHarness", declaration);
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

/**
 * @docs
 * @kind heading
 * @name declareInitialPrompt
 * @file parameters/tasks/<task>/initial-prompts/<name>.ts
 * @description
 * What the agent is asked. Give either `prompt` or `turns`. Takes the shared options too, but
 * `applyParameter` gets no `ctx.dir`.
 *
 * ```ts
 * export default declareInitialPrompt({
 *   prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
 *   timeoutSeconds: 600,
 * });
 * ```
 */

/**
 * @docs
 * @name prompt
 * @type {string}
 * @description
 * A single prompt.
 */

/**
 * @docs
 * @name turns
 * @type {string[]}
 * @description
 * Several prompts, each run by the harness's `cli` in turn, in the same container and agent
 * session, so a later turn can ask about an earlier one.
 */

/**
 * @docs
 * @name timeoutSeconds
 * @type {number}
 * @description
 * **Required.** How long the agent may take, across every turn together.
 */

/**
 * An initial prompt is one file, not a folder, so its fragment has no `ctx.dir`. It is used when
 * the harness runs, so its fragment is usually left out.
 *
 * It's a single `prompt`, or a list of `turns`, each run by the harness's `cli` in turn, in the
 * same container and agent session, so a later turn can ask about an earlier one. Its
 * `timeoutSeconds` covers every turn together.
 */
export type InitialPromptDeclaration<C = unknown, R = unknown> = Applies<C, FragmentCtx, R> & {
  timeoutSeconds: number;
} & ({ prompt: string; turns?: never } | { turns: string[]; prompt?: never });

export function declareInitialPrompt<C = undefined, R extends ResolvedOf = undefined>(
  declaration: InitialPromptDeclaration<C, R>,
): InitialPromptDeclaration<C, R> {
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

/**
 * @docs
 * @kind heading
 * @name declareMeasurement
 * @file parameters/tasks/<task>/measurements/<name>.ts
 * @description
 * What is measured after each run.
 *
 * ```ts
 * export default declareMeasurement({
 *   instrument: "fileCreated",
 *   config: { glob: "**\/isPrime.ts" },
 *   aggregate: ["rate"],
 * });
 * ```
 */

/**
 * @docs
 * @name instrument
 * @type {"fileCreated" | "grep" | "templateTest" | "replyMatches" | "shell"}
 * @description
 * What to measure. Each instrument takes its own `config`:
 *
 * | Instrument | `config` | Value |
 * | --- | --- | --- |
 * | `fileCreated` | `{ glob }` | Whether the agent left a matching file |
 * | `grep` | `{ glob, pattern }` | Lines across the matching files that match `pattern` |
 * | `templateTest` | `{ subject, template }` | Tests passed and failed |
 * | `replyMatches` | `{ pattern, turn? }` | Whether the agent's reply matches `pattern` |
 * | `shell` | `{ command }` | Whether `command` exits 0 |
 */

/**
 * @docs
 * @name aggregate
 * @type {string[]}
 * @description
 * How values combine across iterations. Booleans: `rate`, `count`. Numbers: `mean`, `median`,
 * `min`, `max`, `sum`.
 */

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
  /**
   * Does `command`, any shell command, exit 0? It runs with `sh -c` in the measurement
   * container, in `workdir`, so it can use whatever the image has installed.
   */
  shell: { config: { command: string }; value: boolean };
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
 * @docs
 * @kind heading
 * @name declareTestCase
 * @file test-cases/<name>.ts
 * @description
 * Which parameters to run, and how often. Every list is crossed with every other, and each
 * combination runs `iterations` times. Run `thunderjar generate` after adding a parameter, so its
 * name type-checks here.
 *
 * ```ts
 * export default declareTestCase({
 *   baseImage: ["node20"],
 *   codeState: ["baseline"],
 *   promptSet: ["snerk"],
 *   harnessModel: ["claude-code-2.1.311/claude-sonnet-5-5"],
 *   task: "is-prime",
 *   initialPrompt: ["plain"],
 *   iterations: 5,
 * });
 * ```
 */

/**
 * Every name must be declared under `parameters/`, and each initial prompt must be one of
 * `task`'s, once `thunderjar generate` has run.
 */
export type TestCaseDeclaration<T extends TaskNames = TaskNames> = {
  /** @docs @name baseImage @type {BaseImageName[]} @description Folders under `parameters/baseImages/`. */
  baseImage: BaseImageNames[];
  /** @docs @name codeState @type {CodeStateName[]} @description Folders under `parameters/codeStates/`. */
  codeState: CodeStateNames[];
  /** @docs @name promptSet @type {PromptSetName[]} @description Folders under `parameters/promptSets/`. */
  promptSet: PromptSetNames[];
  /**
   * @docs
   * @name harnessModel
   * @type {`${harness}/${modelId}`[]}
   * @description
   * A folder under `parameters/harnessModels/`, and the model ID to give it.
   */
  harnessModel: HarnessModelNames[];
  /** @docs @name task @type {TaskName} @description A folder under `parameters/tasks/`. */
  task: T;
  /** @docs @name initialPrompt @type {InitialPromptName[]} @description Files in that task's `initial-prompts/`. */
  initialPrompt: (T extends keyof InitialPromptNamesByTask ? InitialPromptNamesByTask[T] : never)[];
  /** @docs @name iterations @type {number} @description How many times to run each combination. */
  iterations: number;
};

export function declareTestCase<T extends TaskNames>(declaration: TestCaseDeclaration<T>): TestCaseDeclaration<T> {
  return declared("declareTestCase", declaration);
}

export type SqliteStore = { kind: "sqlite"; path: string };

export function sqliteStore(options: { path: string }): SqliteStore {
  return { kind: "sqlite", ...options };
}

export type ImageStore = { repository: string };

/**
 * What prerun builds are given beside their build context, for a fragment that needs a credential
 * at build time only, e.g. to clone a private repository. Never in an image layer, the run data, or
 * any hash: Docker reads each secret from Thunderjar's environment as it builds.
 */
export type BuildOptions = {
  /**
   * Each passed as `docker build --secret id=<id>,env=<env>`, for a fragment to mount for one
   * `RUN`, at `/run/secrets/<id>`: `RUN --mount=type=secret,id=github git clone
   * "https://x-access-token:$(cat /run/secrets/github)@github.com/acme/private.git" /workspace`.
   * `plan`, `build` and `run` stop if `env` is unset.
   */
  secrets?: { id: string; env: string }[];
  /** Passes the host's SSH agent as `docker build --ssh default`, for `RUN --mount=type=ssh git clone git@github.com:…`. */
  ssh?: boolean;
};

/**
 * Where `run` runs containers, instead of the local Docker daemon: any command that takes the
 * `docker` CLI's arguments. Thunderjar puts `command` in front of each `docker` subcommand it
 * would run, e.g. `["docker", "--context", "cloud"]`, `["docker", "-H", "ssh://me@build-host"]`
 * or `["podman", "--remote"]`.
 *
 * Images are still built and pushed locally. The runtime pulls them from the image store, so
 * `imageStore` must be set, and the runtime must be able to pull from it, and push to it: its
 * registry login is set up on the runtime, not by Thunderjar. `thunderjar doctor` checks it.
 */
export type RuntimeConfig = { command: string[] };

/**
 * @docs
 * @kind heading
 * @name declareConfig
 * @file thunderjar.config.ts
 * @description
 * Where images and run data are kept.
 *
 * ```ts
 * export default declareConfig({
 *   imageStore: null,
 *   runDataStore: sqliteStore({ path: "./run-data.sqlite" }),
 * });
 * ```
 */
export type ConfigDeclaration = {
  /**
   * @docs
   * @name imageStore
   * @type {{ repository: string } | null}
   * @description
   * The registry repository prerun and postrun images are pushed to, e.g.
   * `{ repository: "ghcr.io/acme/thunderjar-images" }`, with the user's `docker login`. `null`
   * keeps them in the local Docker daemon only: nothing is pushed, and no login is needed.
   */
  imageStore: ImageStore | null;
  /**
   * @docs
   * @name runDataStore
   * @type {SqliteStore}
   * @description
   * Where run data is kept. Make one with `sqliteStore({ path })`.
   */
  runDataStore: SqliteStore;
  /**
   * @docs
   * @name build
   * @type {{ secrets?: { id: string; env: string }[]; ssh?: boolean }}
   * @default {}
   * @description
   * Secrets, and the SSH agent, for prerun builds, e.g. to clone a private repository. Each secret
   * is passed as `docker build --secret id=<id>,env=<env>`, and never written to an image or the
   * run data. `ssh: true` passes the host's SSH agent as `docker build --ssh default`.
   */
  build?: BuildOptions;
  /** Where `run` runs containers. The local Docker daemon by default, or with `run --local`. */
  runtime?: RuntimeConfig;
};

export function declareConfig(config: ConfigDeclaration): ConfigDeclaration {
  return declared("declareConfig", config);
}
