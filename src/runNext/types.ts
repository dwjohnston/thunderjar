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
import type { TestCaseDeclaration } from "../api/declarations.ts";
import type { Overrides } from "../config/overrides.ts";
import type { ApplicationStateService } from "../services/ApplicationState/ApplicationState.ts";
import type { Clock } from "../services/Clock/Clock.ts";
import type { Displayer, OutputFormat } from "../services/Displayer/Displayer.ts";
import type { DockerService } from "../services/Docker/Docker.ts";
import type { Env } from "../services/Env/Env.ts";
import type { Fs } from "../services/Fs/Fs.ts";
import type { Output } from "../services/Io/Io.ts";
import type { Random } from "../services/Random/Random.ts";
import type { RunDataStore } from "../services/RunDataStore/RunDataStore.ts";

export type { OutputFormat };

/** What `thunderjar run-next` is given on the command line. */
export type RunOptions = Overrides & {
  dryRun?: boolean;
  buildOnly?: boolean;
  json?: boolean;
};

export type RunMode = "full" | "dry-run" | "build-only";

/** A test case with its overrides applied. */
export type TestCaseConfig = TestCaseDeclaration & { name: string };

/** Settings from the environment that `runNext` needs. Open: whether these move onto `Env`. */
export type RunSettings = {
  /** The most containers running at once. */
  concurrency: number;
  /** New runs wait while more committed images than this are still waiting to upload. */
  uploadBacklogCap: number;
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
  state: ApplicationStateService<Manifest>;
  displayer: Displayer;
  stdout: Output;
  stderr: Output;
};

/** One parameter of a permutation, in layer order. */
export type PlannedParameter = {
  layer: "baseImage" | "codeState" | "promptSet" | "harnessModel" | "initialPrompt";
  value: string;
  /** The parameter's apply function, as source. */
  apply: string;
  hash: string;
};

export type PlannedPermutation = {
  /** Maps one-to-one to a pre-run image. */
  hash: string;
  parameters: PlannedParameter[];
  prerunImage: string;
};

export type PlannedRun = {
  /** `<execution id>-<permutation hash>-i<iteration>` */
  runId: string;
  permutationHash: string;
  iteration: number;
};

/** Everything an execution will do. Pure output of `plan`. */
export type Manifest = {
  executionId: string;
  testCaseName: string;
  concurrency: number;
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
  postrunImage?: string;
};

export type CommittedImage = { runId: string; reference: string };
