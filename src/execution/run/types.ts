/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// The types every level of `run` shares. See ../AGENTS.md ("The run architecture") and
// project-md/human-safe-space/refactor-work/architecture-plan.md.
import type { BuildOptions, ImageStore, Reply, Resolved, TestCaseDeclaration, TokenCosts } from "../../api/declarations.ts";
import type { Overrides } from "../../config/overrides.ts";
import type { Axis, HashedPermutation } from "../../config/permutations.ts";
import type { ApplicationStateService } from "../../services/ApplicationState/ApplicationState.ts";
import type { Clock } from "../../services/Clock/Clock.ts";
import type { CommandRunner } from "../../services/CommandRunner/CommandRunner.ts";
import type { Displayer, OutputFormat } from "../../services/Displayer/Displayer.ts";
import type { DockerService } from "../../services/Docker/Docker.ts";
import type { Env } from "../../services/Env/Env.ts";
import type { Fs } from "../../services/Fs/Fs.ts";
import type { Io } from "../../services/Io/Io.ts";
import type { Random } from "../../services/Random/Random.ts";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure } from "../../store/runDataStore.ts";
import type { Stores } from "../../store/stores.ts";
import type { FolderRole } from "../prerunDockerfile.ts";

export type { OutputFormat } from "../../services/Displayer/Displayer.ts";

// ---------------------------------------------------------------------------------------------
// Level 1: options
// ---------------------------------------------------------------------------------------------

/** What `thunderjar run <test case>` was given, as commander parsed it. */
export type RunOptions = Overrides & {
  dryRun?: boolean;
  buildOnly?: boolean;
  json?: boolean;
  /** `--concurrency`: the most containers at once, over THUNDERJAR_CONCURRENCY and the runtime's. */
  concurrency?: number;
  /** `--timings`: show how long each phase took, once it ends. */
  timings?: boolean;
  /** `--image-prefix`. `thunderjar` by default. */
  imagePrefix?: string;
  /** `--data-dir`: the folder of the SQLite run data store, instead of the config's. */
  dataDir?: string;
};

/** How far `run` goes: everything, only the manifest, or the manifest and its prerun images. */
export type RunMode = "full" | "dry-run" | "build-only";

/** What `splitOptions` makes of RunOptions: the three kinds the plan names, and no option goes to two. */
export type SplitOptions = {
  /** Merged into the TestCaseConfig by `resolveTestCase`. */
  overrides: RunOverrides;
  /** Passed to level 2, never into the config. */
  mode: RunMode;
  /** Sets the displayer's mode, and goes no further down. */
  output: OutputFormat;
};

/** Everything that changes the TestCaseConfig: the test case's overridable fields, and the machine-level ones. */
export type RunOverrides = {
  testCase: Overrides;
  concurrency?: number;
  timings?: boolean;
  imagePrefix?: string;
  dataDir?: string;
};

// ---------------------------------------------------------------------------------------------
// TestCaseConfig: what `resolveTestCase` returns. Everything `plan` needs, already loaded.
// ---------------------------------------------------------------------------------------------

/** One permutation, with what was loaded from its parameters' declarations. Plan order. */
export type ResolvedPermutation = {
  hashed: HashedPermutation;
  /** Its harness's name (the folder), version and the pair's model ID. */
  harness: { name: string; version: string; modelId: string };
  /** The names of the variables its harness needs, of each `oneOf` the one set. */
  harnessEnv: string[];
  /** Its base image's `runOptions`. */
  runOptions: string[];
  /** Its initial prompt's. */
  timeoutSeconds: number;
  /** Where each folder parameter is, relative to `root`, e.g. `parameters/baseImages/node`. Its `files/` go in the build context. */
  parameterFolders: Record<FolderRole, string>;
};

export type TestCaseConfig = {
  /** The `.thunderjar/` folder. */
  root: string;
  /** The test case's name. */
  name: string;
  /** The declaration, its overrides already applied and checked. */
  testCase: TestCaseDeclaration;
  /** The test case overrides given, recorded with the execution. */
  overrides: Overrides;
  /** This execution's ID: a ULID from `deps.random`, made here so `plan` stays pure. */
  executionId: string;
  permutations: ResolvedPermutation[];
  imagePrefix: string;
  imageStore: ImageStore | null;
  build: Required<BuildOptions>;
  /** The config's runtime, or null: containers run on the host's Docker. */
  runtime: { command: string[]; concurrency: number; beforeExecution?: string[]; afterExecution?: string[] } | null;
  /** `--concurrency`, if given. */
  concurrency?: number;
  dataDir?: string;
  timings: boolean;
  /** Warnings to show, e.g. the config's deprecations. */
  warnings: string[];
};

// ---------------------------------------------------------------------------------------------
// Manifest: what `plan` returns. Plain data: `--dry-run --json` prints it as it is.
// ---------------------------------------------------------------------------------------------

/** One parameter of a permutation. A permutation lists them in layer order: base image, code state, prompt set, harness model, initial prompt. */
export type PlannedParameter = { axis: Axis; name: string; parameterHash: string; resolved?: Resolved };

/** A prerun image the runs need. One per image hash: permutations with the same one share it. */
export type PlannedImage = {
  imageHash: string;
  /** Its name on the daemon that builds it, e.g. `thunderjar-prerun:1a2b3c4d`. */
  image: string;
  /** Where the image store keeps it, e.g. `ghcr.io/acme/images:prerun-h1a2b3c4d`. Absent with no image store. */
  stored?: string;
  /** What containers are started from: `stored` on a remote runtime, else `image`. */
  runFrom: string;
  dockerfile: string;
  /** The `files/` folders copied into its build context: from `<root>/<from>/files/` to `<context>/<to>/`. A parameter with no `files/` copies nothing. */
  context: { role: FolderRole; from: string; to: string }[];
};

export type PlannedPermutation = {
  /** Counts from 1, in plan order. */
  number: number;
  /** The permutation hash, in full. Maps one-to-one to a prerun image... through `imageHash`. */
  hash: string;
  imageHash: string;
  /** The image its containers start from: its PlannedImage's `runFrom`. */
  prerunImage: string;
  parameters: PlannedParameter[];
  harness: { name: string; version: string; modelId: string };
  /** Variable names passed into its containers from Thunderjar's own environment: its harness's. */
  harnessEnv: string[];
  runOptions: string[];
  timeoutSeconds: number;
};

export type PlannedRun = {
  /** `<execution id>-<abbreviated permutation hash>-i<iteration number>`. */
  runId: string;
  permutationHash: string;
  /** Its permutation's number, and its iteration's: both count from 1. */
  permutation: number;
  iteration: number;
  /** Its container's name: `containerName()` in ../images.ts. */
  container: string;
  /** What its container is committed into, on the runtime: `postrunImage()` in ../images.ts. */
  postrunImage: string;
  /** Where the image store keeps it. Absent with no image store. */
  storedPostrunImage?: string;
};

export type Manifest = {
  executionId: string;
  /** The `.thunderjar/` folder. */
  root: string;
  testCase: string;
  task: string;
  /** The most containers running at once. */
  concurrency: number;
  /** The most prerun images building at once. */
  buildConcurrency: number;
  imagePrefix: string;
  imageStore: ImageStore | null;
  /** Whether containers run on a runtime that isn't the host. */
  remote: boolean;
  /** As the execution record keeps it. */
  matrix: ExecutionRecord["matrix"];
  overrides?: Overrides;
  /** The test case's `env` (set, with these values) and `secretEnv` (names, passed from Thunderjar's environment). */
  env: Record<string, string>;
  secretEnv: string[];
  /** What each prerun build is given. */
  build: { secrets: { id: string; env: string }[]; ssh: boolean };
  hooks: { beforeExecution?: string[]; afterExecution?: string[] };
  dataDir?: string;
  timings: boolean;
  images: PlannedImage[];
  permutations: PlannedPermutation[];
  /** Every run, grouped by permutation, in plan order: the scheduler's order. */
  runs: PlannedRun[];
};

// ---------------------------------------------------------------------------------------------
// Level 3
// ---------------------------------------------------------------------------------------------

/** How one run ended. `runPermutation` never throws: a failure is a `crashed` record. */
export type RunRecord = {
  runId: string;
  status: "finished" | "timedOut" | "crashed" | "cancelled";
  /** What was recorded in the run data store. Absent if it crashed before there was anything to record, or was cancelled. */
  record?: ContainerRunRecord;
  /** Why, for `crashed`. */
  error?: string;
};

/** A committed postrun image, waiting to be pushed to the image store. */
export type CommittedImage = { runId: string; image: string; reference: string };

export interface UploadQueue {
  enqueue(image: CommittedImage): void;
  /** How many are waiting or being pushed. */
  backlog(): number;
  /** Resolves once every image enqueued is pushed, or has failed. Never rejects. */
  drain(): Promise<void>;
}

/** What `runManifest` returns, and `--json` prints. */
export type ExecutionResult = { execution: ExecutionRecord; recordedIn: string; containerRuns: ContainerRunRecord[]; runs: RunRecord[] };

// ---------------------------------------------------------------------------------------------
// Services that live above the `services` layer, because their types do.
// ---------------------------------------------------------------------------------------------

// Opens the run data store: `dataDir`'s SQLite file, or else the project config's. Declared in
// src/store/stores.ts, since the store layer can't import from here.
export type { Stores } from "../../store/stores.ts";

/** What a run left, read out of its container. */
export type Collected = { reply: Reply; tokenCosts: TokenCosts };

/**
 * Everything that needs a project's own code to judge a run: its harness's collectors, and its
 * task's measurements. A service, so a test of `runPermutation` passes a FakeMeasurer.
 */
export interface Measurer {
  /** The harness's `collectReply` and `collectTokenCosts`, of the result file's text. */
  collect(of: { root: string; harness: PlannedPermutation["harness"] }, harnessResult: string | null): Promise<Collected>;
  /** Takes the task's measurements of a committed run. `{}` if the task has none. */
  measure(
    of: { root: string; task: string; postrunImage: string; container: string; secretEnv: string[] },
    recorded: { harnessResult: string | null; reply: Reply },
  ): Promise<Record<string, RecordedMeasure>>;
}

// ---------------------------------------------------------------------------------------------
// The run's slice of the application state (ApplicationState's `M` is Manifest).
// ---------------------------------------------------------------------------------------------

export type RunApplicationState = ApplicationStateService<Manifest>;

// ---------------------------------------------------------------------------------------------
// Dependencies: built once, in src/cli/index.ts, and passed down. Functions take a Pick of it.
// ---------------------------------------------------------------------------------------------

export type Dependencies = {
  env: Env;
  clock: Clock;
  random: Random;
  fs: Fs;
  io: Io;
  /** Docker on the machine Thunderjar runs on: registry lookups and the login check. */
  hostDocker: DockerService;
  /** Docker where containers run: builds, pulls, runs, commits, pushes. `hostDocker` itself with no runtime. */
  runtimeDocker: DockerService;
  /** Runs the runtime's `beforeExecution` and `afterExecution`. */
  commands: CommandRunner;
  stores: Stores;
  measurer: Measurer;
  state: RunApplicationState;
  displayer: Displayer;
};
