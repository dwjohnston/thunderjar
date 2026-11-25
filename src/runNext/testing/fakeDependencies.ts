/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What the tests of `runNext`'s levels share: a `Dependencies` of fakes, and a small hand-made test case.
import type { Measurement } from "../../config/measurements.ts";
import { RESULT_PATH, RUN_PATH, STDERR_PATH } from "../../execution/runScript.ts";
import { FakeApplicationState } from "../../services/ApplicationState/FakeApplicationState.ts";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { FakeDisplayer } from "../../services/Displayer/FakeDisplayer.ts";
import type { FakeContainer } from "../../services/Docker/FakeDockerService.ts";
import { FakeDockerService } from "../../services/Docker/FakeDockerService.ts";
import { FakeEnv } from "../../services/Env/FakeEnv.ts";
import { FakeFs } from "../../services/Fs/FakeFs.ts";
import { FakeIo } from "../../services/Io/FakeIo.ts";
import { FakeRandom } from "../../services/Random/FakeRandom.ts";
import { FakeRunDataStore } from "../../services/RunDataStore/FakeRunDataStore.ts";
import { FakeRuntimeHooks } from "../../services/RuntimeHooks/FakeRuntimeHooks.ts";
import { plan } from "../plan/plan.ts";
import type { Dependencies, Manifest, ResolvedPermutation, RunDetails, RunEvent, TestCaseConfig } from "../types.ts";

/** When the fake clock starts: 1 January 2026, so times are valid epoch milliseconds. */
export const START = Date.UTC(2026, 0, 1);

/** The execution ID of `fakeManifest`, unless it's given another. */
export const EXECUTION_ID = "exec";

/** Where the run data store of `fakeDependencies` says it is. */
export const RUN_STORE_LOCATION = "/data/runs.sqlite";

/** The registry host of `IMAGE_STORE`, which `fakeDependencies` is logged in to. */
export const REGISTRY_HOST = "registry.example.com";
export const IMAGE_STORE = { repository: `${REGISTRY_HOST}/team/images` };

/** `Dependencies`, with each service typed as its fake, so a test can drive and read it. */
export type FakeDependencies = Dependencies & {
  clock: FakeClock;
  random: FakeRandom;
  fs: FakeFs;
  hostDocker: FakeDockerService;
  runtimeDocker: FakeDockerService;
  runStore: FakeRunDataStore;
  runtimeHooks: FakeRuntimeHooks;
  state: FakeApplicationState<Manifest, RunDetails>;
  displayer: FakeDisplayer;
  /** `stdout`, `stderr` and `onStop` are its: `io.interrupt()` is Ctrl-C. */
  io: FakeIo;
};

/**
 * Every service as a fake. The two Docker daemons share one registry, as the host's and a
 * runtime's do, and the host is logged in to `REGISTRY_HOST`. Nothing waits unless a test makes
 * it: the cache warm-up is 0.
 */
export function fakeDependencies(overrides: Partial<Pick<Dependencies, "env" | "settings">> = {}): FakeDependencies {
  const clock = new FakeClock(START);
  const io = new FakeIo();
  const registry = new Set<string>();
  const hostDocker = new FakeDockerService(clock, { registry });
  hostDocker.logins.add(REGISTRY_HOST);
  return {
    env: FakeEnv(),
    settings: { concurrency: 1, uploadBacklogCap: 4, cacheWarmupMs: 0, uploadConcurrency: 2, runStoreLocation: async () => RUN_STORE_LOCATION },
    clock,
    random: new FakeRandom(clock),
    fs: new FakeFs(),
    hostDocker,
    runtimeDocker: new FakeDockerService(clock, { registry }),
    runStore: new FakeRunDataStore(),
    runtimeHooks: new FakeRuntimeHooks(),
    state: new FakeApplicationState<Manifest, RunDetails>(),
    displayer: new FakeDisplayer(),
    io,
    stdout: io.stdout,
    stderr: io.stderr,
    onStop: (handler) => io.onStop(handler),
    ...overrides,
  };
}

/**
 * One permutation, named by a letter: `fakePermutation("a")` has the permutation hash
 * `aaaaaaaa…` and, unless given another, the image hash `aaaaaaaa…` too. Its harness is `echo`,
 * whose reply is its result file's text. It's given no variables, so nothing is searched for secrets.
 */
export function fakePermutation(letter: string, imageLetter: string = letter): ResolvedPermutation {
  const harnessModel = `echo/model-${letter}`;
  return {
    hashed: {
      baseImage: "base",
      codeState: "code",
      promptSet: "prompts",
      harnessModel,
      initialPrompt: "plain",
      hash: letter.repeat(16),
      parameterHashes: { baseImage: "h-base", codeState: "h-code", promptSet: "h-prompts", harnessModel: "h-echo", initialPrompt: "h-plain" },
      modelId: `model-${letter}`,
      imageHash: imageLetter.repeat(16),
      dockerfile: `FROM scratch\n# ${imageLetter}\n`,
      resolved: {},
    },
    env: [],
    runOptions: [],
    timeoutSeconds: 60,
    harness: { version: "1.0.0", models: {}, collectReply: (raw: string) => raw } as unknown as ResolvedPermutation["harness"],
    collectTokenCosts: () => ({ outcome: "unavailable", reason: "absent" }),
    version: "1.0.0",
  };
}

/** A measurement that needs no container: whether the agent's reply matches `pattern`. */
export function replyMeasurement(name: string, pattern: string): Measurement {
  return { name, declaration: { instrument: "replyMatches", config: { pattern }, metrics: {} }, config: { pattern }, contentHash: `hash-of-${name}` };
}

/**
 * A test case of one permutation, `a`, run once: no image store, no runtime, no measurements.
 * `permutations` are letters, each a `fakePermutation`.
 */
export function fakeTestCase({ permutations = ["a"], ...overrides }: Partial<Omit<TestCaseConfig, "permutations">> & { permutations?: (string | ResolvedPermutation)[] } = {}): TestCaseConfig {
  const resolved = permutations.map((permutation) => (typeof permutation === "string" ? fakePermutation(permutation) : permutation));
  return {
    baseImage: ["base"],
    codeState: ["code"],
    promptSet: ["prompts"],
    harnessModel: resolved.map(({ hashed }) => hashed.harnessModel),
    task: "greet",
    initialPrompt: ["plain"],
    iterations: 1,
    name: "greeting",
    root: "/project/.thunderjar",
    overrides: {},
    imagePrefix: "tj",
    imageStore: null,
    build: { secrets: [], ssh: false, concurrency: 1 },
    runtime: null,
    permutations: resolved,
    measurements: [],
    testCaseEnv: {},
    secretEnv: [],
    ...overrides,
  } as TestCaseConfig;
}

/** The real `plan` of `fakeTestCase(config)`, as execution `EXECUTION_ID`. */
export function fakeManifest(config: Parameters<typeof fakeTestCase>[0] = {}, settings: { concurrency?: number; executionId?: string } = {}): Manifest {
  return plan(fakeTestCase(config), { concurrency: 1, executionId: EXECUTION_ID, ...settings });
}

/** Puts `manifest` in the state, as `runTestCase` does before the levels below it run. */
export function seedManifest(deps: Pick<FakeDependencies, "state">, manifest: Manifest): void {
  deps.state.update((state) => ({ ...state, run: { ...state.run, manifest } }));
}

/**
 * A container whose agent ran for a second and exited with `exitCode`, leaving `result` as its
 * result file: pass it to `FakeDockerService.on`.
 */
export function agentRan({ exitCode = 0, result = "hello", stderr }: { exitCode?: number; result?: string; stderr?: string } = {}): FakeContainer {
  return {
    files: {
      [RUN_PATH]: JSON.stringify({ startedAt: START, finishedAt: START + 1_000, exitCode }),
      [RESULT_PATH]: result,
      ...(stderr !== undefined && { [STDERR_PATH]: stderr }),
    },
  };
}

/** A container whose agent started, and was killed 60 seconds later for taking too long. */
export function agentTimedOut(): FakeContainer {
  return { stop: { outcome: "timedOut", killedAt: START + 60_000 }, files: { [RUN_PATH]: JSON.stringify({ startedAt: START }) } };
}

/** A container that never started. */
export function agentNeverStarted(reason = "no space left on device"): FakeContainer {
  return { stop: { outcome: "notStarted", reason, spawnedAt: START, gaveUpAt: START + 5_000 } };
}

/** The log's events, each as `<what>:<step>`, e.g. `tj-prerun:aaaaaaaa:built` or `exec-1-1:started`. */
export function loggedSteps(deps: Pick<FakeDependencies, "state">): string[] {
  const name = (event: RunEvent) => (event.type === "image" ? event.image : event.type === "run" ? event.runId : event.type === "hook" ? event.hook : event.signal);
  return (deps.state.get().run.details?.log ?? []).map((event) => `${name(event)}:${event.type === "stopping" ? "stopping" : event.step}`);
}

/** Lets every pending promise callback run, without moving the clock. */
export const settle = (deps: Pick<FakeDependencies, "clock">) => deps.clock.advance(0);
