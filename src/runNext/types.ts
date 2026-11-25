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
import type { BuildOptions, ImageStore, TestCaseDeclaration } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import type { Overrides } from "../config/overrides.ts";
import type { Axis } from "../config/permutations.ts";
import type { PlannedPermutation as LoadedPermutation } from "../execution/planExecution.ts";
import type { ApplicationStateService } from "../services/ApplicationState/ApplicationState.ts";
import type { Clock } from "../services/Clock/Clock.ts";
import type { Displayer, OutputFormat } from "../services/Displayer/Displayer.ts";
import type { DockerService } from "../services/Docker/Docker.ts";
import type { Env } from "../services/Env/Env.ts";
import type { Fs } from "../services/Fs/Fs.ts";
import type { Io, Output } from "../services/Io/Io.ts";
import type { Random } from "../services/Random/Random.ts";
import type { ContainerRunRecord, RunDataStore } from "../services/RunDataStore/RunDataStore.ts";

export type { OutputFormat };

/** What `thunderjar run` is given on the command line. */
export type RunOptions = Overrides & {
  dryRun?: boolean;
  buildOnly?: boolean;
  json?: boolean;
  /** The most containers running at once, in place of the environment's and the runtime's. */
  concurrency?: number;
  /** What image and container names start with. */
  imagePrefix?: string;
  /** Show how long each phase took. */
  timings?: boolean;
};

export type RunMode = "full" | "dry-run" | "build-only";

/** A permutation with its parameters loaded and hashed: what `plan` lays out, and what a run needs of its harness. */
export type ResolvedPermutation = Omit<LoadedPermutation, "iterations">;

/**
 * A test case with its overrides applied, and everything read from the project that an execution
 * of it needs, so nothing below level 1 reads the project's files, except to build an image.
 */
export type TestCaseConfig = TestCaseDeclaration & {
  name: string;
  /** The `.thunderjar/` folder. */
  root: string;
  /** What was given on the command line in place of the test case's own. */
  overrides: Overrides;
  imagePrefix: string;
  /** The most containers running at once: the option, or the environment's, or the runtime's, or 1. */
  concurrency: number;
  /** Where images are pushed, or null to keep them in the daemon they're built in. */
  imageStore: ImageStore | null;
  build: Required<BuildOptions>;
  /** The runtime's commands to run around the execution. */
  hooks: { beforeExecution?: string[]; afterExecution?: string[] };
  /** In plan's order. */
  permutations: ResolvedPermutation[];
  /** The task's measurements. */
  measurements: Measurement[];
};

/** Settings from the environment that `runNext` needs. Open: whether these move onto `Env`. */
export type RunSettings = {
  /** The most containers running at once: THUNDERJAR_CONCURRENCY. Unset, the runtime's, or 1. */
  concurrency?: number;
  /** New runs wait while more committed images than this are still waiting to upload. */
  uploadBacklogCap: number;
  /** How many committed images upload at once. */
  uploadConcurrency: number;
  /** How long the first iteration of a permutation gets to write the prompt cache before the rest start. */
  cacheWarmupMs: number;
};

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
  /** Where `runStore` is, to tell the user. */
  runStoreLocation: () => Promise<string>;
  state: ApplicationStateService<Manifest>;
  displayer: Displayer;
  stdout: Output;
  stderr: Output;
  /** Ctrl-C, or the process being asked to stop. */
  onStop: Io["onStop"];
  /** Aborted once the command is asked to stop: nothing new starts after. Set by level 1. */
  signal?: AbortSignal;
};

/** One parameter of a permutation, in layer order. */
export type PlannedParameter = {
  layer: Axis;
  value: string;
  hash: string;
};

export type PlannedPermutation = {
  /** Counts from 1, in plan's order. */
  number: number;
  /** The permutation hash: identifies its runs. */
  hash: string;
  /** The hash of its pre-run image's content: permutations that build the same image share it. */
  imageHash: string;
  parameters: PlannedParameter[];
  modelId: string;
  harnessVersion: string;
  /** Its pre-run image's name in the daemon it's built in. */
  prerunImage: string;
  /** Where its pre-run image is pushed. Absent without an image store. */
  storedPrerunImage?: string;
  /** The names of the variables its harness needs, passed into each of its containers. */
  env: string[];
  /** The test case's `env`: set, with these values, in each of its containers. */
  testCaseEnv: Record<string, string>;
  /** The test case's `secretEnv`: more names passed in. */
  secretEnv: string[];
  /** More `docker run` options, from its base image. */
  runOptions: string[];
  /** How long its agent may run before it's killed. */
  timeoutSeconds: number;
};

export type PlannedRun = {
  /** `<execution id>-<abbreviated permutation hash>-i<iteration>` */
  runId: string;
  permutationHash: string;
  /** Its permutation's number. */
  permutation: number;
  /** Counts from 1. */
  iteration: number;
  /** Its container's name. */
  container: string;
  /** Its post-run image's name in the daemon it's committed in. */
  postrunImage: string;
  /** Where its post-run image is pushed. Absent without an image store. */
  storedPostrunImage?: string;
};

/** Everything an execution will do. Pure output of `plan`. */
export type Manifest = {
  executionId: string;
  testCaseName: string;
  task: string;
  concurrency: number;
  /** How many pre-run images build at once. */
  buildConcurrency: number;
  imagePrefix: string;
  /** The image store's repository, or null. */
  imageStore: string | null;
  /** What was given on the command line in place of the test case's own. */
  overrides: Overrides;
  permutations: PlannedPermutation[];
  runs: PlannedRun[];
};

/** `crashed`: its container never started, its agent exited non-zero, or Docker failed under it. */
export type RunOutcome = "completed" | "crashed" | "timedOut";

/** What `runPermutation` returns. It never throws: a failure is an outcome. */
export type RunRecord = {
  runId: string;
  outcome: RunOutcome;
  startedAt: number;
  finishedAt: number;
  postrunImage?: string;
  /** What the run data store has of it. Absent if it couldn't be recorded. */
  containerRun?: ContainerRunRecord;
  /** Why it crashed, if Docker or the run data store failed under it. */
  error?: string;
};

export type CommittedImage = {
  runId: string;
  /** Its name in the daemon it was committed in. */
  image: string;
  /** Where it's pushed. */
  reference: string;
};

/** What level 1 returns: the process's exit code, and each run's record, if any ran. */
export type RunResult = {
  exitCode: number;
  records?: RunRecord[];
  /** Why it failed, if something did that no run's own line says, e.g. the runtime's `afterExecution`. */
  error?: string;
};
