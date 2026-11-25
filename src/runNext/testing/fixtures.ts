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

// What runNext's own tests start from: a resolved config, and every dependency as a fake.
import type { HarnessDeclaration } from "../../api/declarations.ts";
import { AXES, type HashedPermutation } from "../../config/permutations.ts";
import { NOT_REPORTED } from "../../execution/planExecution.ts";
import { FakeApplicationState } from "../../services/ApplicationState/FakeApplicationState.ts";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { FakeDisplayer } from "../../services/Displayer/FakeDisplayer.ts";
import { FakeDockerService } from "../../services/Docker/FakeDockerService.ts";
import { FakeFs } from "../../services/Fs/FakeFs.ts";
import { FakeIo } from "../../services/Io/FakeIo.ts";
import { FakeRandom } from "../../services/Random/FakeRandom.ts";
import { FakeRunDataStore } from "../../services/RunDataStore/FakeRunDataStore.ts";
import type { Dependencies, Manifest, ResolvedPermutation, RunSettings, TestCaseConfig } from "../types.ts";

/** A SHA-256-shaped hash that starts with `seed`, so its abbreviation is readable in a test. */
export const hash = (seed: string) => seed.padEnd(64, "0");

/** Each permutation's hash is one letter repeated, so its run IDs are easy to tell apart: permutation 1's are 01exec-oooooooo-i1 and so on. */
const PERMUTATION_LETTERS = "oxwzmvkq";

/** Permutation `number` of a config: harness model `harness-<number>/model`, its hash from the `number`th of PERMUTATION_LETTERS, its image hash from `i<number>`. */
export function permutation(number: number, overrides: Partial<ResolvedPermutation> = {}): ResolvedPermutation {
  const names = { baseImage: "node20", codeState: "baseline", promptSet: "none", harnessModel: `harness-${number}/model`, initialPrompt: "plain" };
  const hashed: HashedPermutation = {
    ...names,
    hash: PERMUTATION_LETTERS[number - 1]!.repeat(64),
    imageHash: hash(`i${number}`),
    modelId: "model",
    dockerfile: "FROM scratch\n",
    parameterHashes: Object.fromEntries(AXES.map((axis) => [axis, hash(`${axis}${number}`)])) as HashedPermutation["parameterHashes"],
    resolved: {},
  };
  return {
    number,
    permutation: hashed,
    prerunImage: `thunderjar-prerun:i${number}000000`,
    env: [],
    testCaseEnv: {},
    secretEnv: [],
    runOptions: [],
    timeoutSeconds: 600,
    harness: {} as HarnessDeclaration,
    collectTokenCosts: NOT_REPORTED,
    version: "1.0.0",
    modelId: "model",
    ...overrides,
  };
}

/** A config of `permutations` permutations, one iteration each, no image store, one container at a time. */
export function config(overrides: Partial<TestCaseConfig> & { permutationCount?: number } = {}): TestCaseConfig {
  const { permutationCount = 1, ...rest } = overrides;
  const permutations = Array.from({ length: permutationCount }, (_, i) => permutation(i + 1));
  return {
    baseImage: ["node20"],
    codeState: ["baseline"],
    promptSet: ["none"],
    harnessModel: permutations.map(({ permutation: { harnessModel } }) => harnessModel),
    initialPrompt: ["plain"],
    task: "is-prime",
    iterations: 1,
    name: "example",
    // Nowhere: a build copies no parameter files from it.
    root: "/nowhere/.thunderjar",
    overrides: {},
    imagePrefix: "thunderjar",
    concurrency: 1,
    imageStore: null,
    build: { secrets: [], ssh: false, concurrency: 1 },
    hooks: {},
    permutations,
    measurements: [],
    ...rest,
  } as TestCaseConfig;
}

export const SETTINGS: RunSettings = { uploadBacklogCap: 4, uploadConcurrency: 2, cacheWarmupMs: 0 };

export type Fakes = Dependencies & {
  clock: FakeClock;
  random: FakeRandom;
  state: FakeApplicationState<Manifest>;
  hostDocker: FakeDockerService;
  runtimeDocker: FakeDockerService;
  runStore: FakeRunDataStore;
  io: FakeIo;
};

/** Every dependency, as a fake. The host's and the runtime's Docker are two daemons that see one registry. */
export function fakes(settings: Partial<RunSettings> = {}): Fakes {
  const clock = new FakeClock(1_000_000);
  const io = new FakeIo();
  const registry = new Set<string>();
  return {
    env: { cwd: "/project", variables: {} },
    settings: { ...SETTINGS, ...settings },
    clock,
    random: new FakeRandom(clock),
    fs: new FakeFs(),
    hostDocker: new FakeDockerService(clock, registry),
    runtimeDocker: new FakeDockerService(clock, registry),
    runStore: new FakeRunDataStore(),
    runStoreLocation: async () => "/project/.thunderjar/.data/runs.sqlite",
    state: new FakeApplicationState<Manifest>(),
    displayer: new FakeDisplayer(),
    stdout: io.stdout,
    stderr: io.stderr,
    onStop: (handler) => io.onStop(handler),
    io,
  };
}
