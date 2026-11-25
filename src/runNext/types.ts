/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// The shapes `runNext` passes between its levels. See project-md/human-safe-space/refactor-work/architecture-plan.md.
import type { BuildOptions, HarnessDeclaration, ImageStore, Resolved, RuntimeConfig, TestCaseDeclaration, TokenCostCollector } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import type { Overrides } from "../config/overrides.ts";
import type { Axis, HashedPermutation } from "../config/permutations.ts";
import type { Phase, PhaseTiming } from "../execution/timings.ts";
import type { ApplicationStateService, RunState } from "../services/ApplicationState/ApplicationState.ts";
import type { Clock } from "../services/Clock/Clock.ts";
import type { Displayer, OutputFormat } from "../services/Displayer/Displayer.ts";
import type { DockerService } from "../services/Docker/Docker.ts";
import type { Env } from "../services/Env/Env.ts";
import type { Fs } from "../services/Fs/Fs.ts";
import type { Output, StopSignal } from "../services/Io/Io.ts";
import type { Random } from "../services/Random/Random.ts";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure, RunDataStore } from "../services/RunDataStore/RunDataStore.ts";
import type { RuntimeHooks } from "../services/RuntimeHooks/RuntimeHooks.ts";

export type { OutputFormat };

/** What `thunderjar run` is given on the command line. */
export type RunOptions = Overrides & {
  dryRun?: boolean;
  buildOnly?: boolean;
  json?: boolean;
  /** What image names start with, instead of `thunderjar`. */
  imagePrefix?: string;
};

export type RunMode = "full" | "dry-run" | "build-only";

/** One permutation of a test case, with everything its runs need, loaded from the project. */
export type ResolvedPermutation = {
  hashed: HashedPermutation;
  /** The names of the variables its harness needs, passed into each of its containers. */
  env: string[];
  /** Its base image's `runOptions`, added to the `docker run` of each of its agent containers. */
  runOptions: string[];
  /** How long its run script may run, from its initial prompt, before it's killed. */
  timeoutSeconds: number;
  /** Its harness, for its `collectReply`. */
  harness: HarnessDeclaration;
  /** Its harness's `collectTokenCosts`, or one that reports none. */
  collectTokenCosts: TokenCostCollector;
  /** Its harness's version. */
  version: string;
};

/**
 * A test case with its overrides applied, and everything about it that's read from the project or
 * the machine, so that `plan` needs to read nothing.
 */
export type TestCaseConfig = TestCaseDeclaration & {
  name: string;
  /** The `.thunderjar/` folder. */
  root: string;
  /** What was given on the command line in place of the test case's own. */
  overrides: Overrides;
  imagePrefix: string;
  /** Where images are pushed, or `null` to keep them in the runtime's daemon. */
  imageStore: ImageStore | null;
  /** The secrets, SSH agent and concurrency of its prerun builds. */
  build: Required<BuildOptions>;
  /** The runtime containers run on, or `null` for the Docker daemon on this machine. */
  runtime: (Pick<RuntimeConfig, "beforeExecution" | "afterExecution"> & { command: string[] }) | null;
  /** Every permutation, in plan order. */
  permutations: ResolvedPermutation[];
  /** The task's measurements. */
  measurements: Measurement[];
  /** The test case's `env`: variables set, with these values, in each agent container. */
  testCaseEnv: Record<string, string>;
  /** The test case's `secretEnv`: more names passed into each agent container. */
  secretEnv: string[];
};

/** Settings from the environment that `runNext` needs. Open: whether these move onto `Env`. */
export type RunSettings = {
  /** The most containers running at once. */
  concurrency: number;
  /** New runs wait while more committed images than this are still waiting to upload. */
  uploadBacklogCap: number;
  /** How long the first iteration of a permutation gets to write the prompt cache before the rest start. */
  cacheWarmupMs: number;
  /** How many committed images are pushed at once. */
  uploadConcurrency: number;
  /** Where the run data store is, as a path or a description, for "Recorded in ...". */
  runStoreLocation: () => Promise<string>;
};

export type RunStateService = ApplicationStateService<Manifest, RunDetails>;
export type RunStateOf = RunState<Manifest, RunDetails>;

/** Every service `runNext` uses, built once at the entry point. */
export type Dependencies = {
  env: Env;
  settings: RunSettings;
  clock: Clock;
  random: Random;
  fs: Fs;
  hostDocker: DockerService;
  runtimeDocker: DockerService;
  runStore: RunDataStore;
  runtimeHooks: RuntimeHooks;
  state: RunStateService;
  displayer: Displayer;
  stdout: Output;
  stderr: Output;
  /** Ctrl-C, or the process being asked to stop. Returns a function that stops listening. */
  onStop: (handler: (signal: StopSignal) => void) => () => void;
};

/** One parameter of a permutation, in layer order. */
export type PlannedParameter = {
  layer: Axis;
  /** The parameter's name. */
  value: string;
  hash: string;
  /** What it resolved to, if it has a `resolve`. */
  resolved?: Resolved;
};

export type PlannedPermutation = ResolvedPermutation & {
  /** Counts from 1, in plan order. */
  number: number;
  /** The permutation hash, which identifies its runs. */
  hash: string;
  parameters: PlannedParameter[];
  /** The pre-run image's name in the daemon that builds it. Permutations with the same image hash share one. */
  prerunImage: string;
  /** Where the pre-run image is kept in the image store, if there's one. */
  storedPrerunImage?: string;
  /** The image its containers start from: the stored one on a remote runtime, or else `prerunImage`. */
  runImage: string;
  testCaseEnv: Record<string, string>;
  secretEnv: string[];
  modelId: string;
};

export type PlannedRun = {
  /** `<execution id>-<permutation number>-<iteration>` */
  runId: string;
  permutationHash: string;
  /** Counts from 1. */
  iteration: number;
  permutation: PlannedPermutation;
  /** The container it runs in. */
  container: string;
  /** The image the container is committed into. */
  postrunImage: string;
  /** Where the post-run image is pushed, if there's an image store. */
  storedPostrunImage?: string;
};

/** Everything an execution will do. Pure output of `plan`. */
export type Manifest = {
  executionId: string;
  testCaseName: string;
  task: string;
  /** The most containers running at once. */
  concurrency: number;
  /** The test case it was planned from. */
  config: TestCaseConfig;
  permutations: PlannedPermutation[];
  runs: PlannedRun[];
};

export type RunOutcome = "completed" | "crashed" | "timedOut";

/** What `runPermutation` returns. It never throws: a failure is an outcome. */
export type RunRecord = {
  runId: string;
  outcome: RunOutcome;
  startedAt: number;
  finishedAt: number;
  /** The agent's exit code, or null if it timed out or crashed. */
  exitCode: number | null;
  postrunImage?: string;
  /** Why it crashed. */
  reason?: string;
};

export type CommittedImage = { runId: string; /** The image in the runtime's daemon. */ image: string; /** Where it's pushed. */ reference: string };

/** A runtime hook, as the log names it. */
export type HookName = "beforeExecution" | "afterExecution";

/**
 * One thing that happened, in the order it happened. The displayer renders the log; nothing else
 * reads it. A step that waits has two entries: one as it starts, one as it ends.
 */
export type RunEvent =
  | { type: "hook"; hook: HookName; command: string[]; step: "running" | "done" | "failed"; at: number }
  | { type: "image"; image: string; step: "building" | "built" | "buildFailed"; at: number }
  | { type: "image"; image: string; reference: string; step: "pushing" | "pushed" | "pushFailed" | "pulling" | "pulled" | "pullFailed"; at: number }
  | { type: "run"; runId: string; step: "started"; at: number }
  | { type: "run"; runId: string; step: "ran"; record: ContainerRunRecord; at: number }
  | { type: "run"; runId: string; step: "measuring"; at: number }
  | { type: "run"; runId: string; step: "measured"; result: Record<string, RecordedMeasure>; at: number }
  | { type: "run"; runId: string; step: "measureFailed"; reason: string; at: number }
  | { type: "run"; runId: string; reference: string; step: "uploading" | "uploaded" | "uploadFailed"; at: number }
  | { type: "run"; runId: string; step: "done"; at: number }
  | { type: "stopping"; signal: StopSignal; at: number };

export type ExecutionTimings = { wallMs: number; phases: Partial<Record<Phase, PhaseTiming>> };

/** What `runNext` keeps in the run state besides the manifest and statuses, for its displayer. */
export type RunDetails = {
  mode: RunMode;
  /** When the execution started, epoch ms. */
  startedAt: number;
  log: readonly RunEvent[];
  /** How long each phase has taken so far. */
  phases: Partial<Record<Phase, PhaseTiming>>;
  /** Set once the process is asked to stop: no more runs start. */
  stopRequested?: StopSignal;
  /** Set once the execution is recorded as ended. */
  finished?: { execution: ExecutionRecord; recordedIn: string; containerRuns: ContainerRunRecord[]; timings: ExecutionTimings };
};
