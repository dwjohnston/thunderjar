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

// What the tests of this folder share: a Dependencies made of fakes, small configs and manifests,
// and a scripted agent for FakeDocker. Only tests import it.
import type { TestCaseDeclaration } from "../../api/declarations.ts";
import type { HashedPermutation } from "../../config/permutations.ts";
import { FakeApplicationState } from "../../services/ApplicationState/FakeApplicationState.ts";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { FakeCommandRunner } from "../../services/CommandRunner/FakeCommandRunner.ts";
import { FakeDisplayer } from "../../services/Displayer/FakeDisplayer.ts";
import { type ContainerScript, FakeDocker } from "../../services/Docker/FakeDocker.ts";
import { FakeRegistry } from "../../services/Docker/FakeRegistry.ts";
import type { Env } from "../../services/Env/Env.ts";
import { FakeEnv } from "../../services/Env/FakeEnv.ts";
import { FakeFs } from "../../services/Fs/FakeFs.ts";
import { FakeIo } from "../../services/Io/FakeIo.ts";
import { FakeRandom } from "../../services/Random/FakeRandom.ts";
import { type FakeRunDataStore, FakeStores } from "../../store/FakeRunDataStore.ts";
import { RESULT_PATH, RUN_PATH, STDERR_PATH } from "../runScript.ts";
import { FakeMeasurer } from "./FakeMeasurer.ts";
import { plan } from "./plan.ts";
import type { Dependencies, Manifest, ResolvedPermutation, TestCaseConfig } from "./types.ts";

/** When the fake clock of `fakeDependencies` starts: 2027-01-15T08:00:00Z. A run's times must look like epoch ms. */
export const START_TIME = 1_800_000_000_000;

/** The execution ID of `aTestCaseConfig`. */
export const EXECUTION_ID = "01hzx0000000000000000000aa";

/** An image store and a runtime, for configs that need one. */
export const AN_IMAGE_STORE = { repository: "registry.example/acme/images" };
export const A_RUNTIME = { command: ["ssh", "box", "docker"], concurrency: 3 };

export type FakeAgentOptions = {
  /** What the agent exits with. 0 by default. */
  exitCode?: number;
  /** The text of its result file, or null to leave none. `done` by default. */
  result?: string | null;
  /** What it writes to its standard error. Nothing by default. */
  stderr?: string;
  /** How long it runs on the clock. A second by default. */
  durationMs?: number;
};

/**
 * A container script for FakeDocker that does what the timed run does (../runScript.ts): writes
 * its start to RUN_PATH, prints the start marker, runs for a while, then leaves its result file,
 * its stderr and how it ended. Like the real one, the container itself exits 0 whatever the agent
 * exited with. One killed for running too long leaves only its start.
 *
 *   docker.on("", fakeAgent({ exitCode: 2, stderr: "out of credit" }));
 */
export function fakeAgent({ exitCode = 0, result = "done", stderr = "", durationMs = 1_000 }: FakeAgentOptions = {}): ContainerScript {
  return async ({ clock, start, write }) => {
    const startedAt = clock.now();
    write(RUN_PATH, `${JSON.stringify({ startedAt })}\n`);
    start();
    await clock.sleep(durationMs);
    if (result !== null) write(RESULT_PATH, result);
    write(STDERR_PATH, stderr);
    write(RUN_PATH, `${JSON.stringify({ startedAt, finishedAt: clock.now(), exitCode })}\n`);
    return 0;
  };
}

/** A hash as long as a real one, of one letter, so a test can see where it is abbreviated: `hashOf("a")`. */
export const hashOf = (letter: string) => letter.repeat(64);

/**
 * A resolved permutation whose hash is `letter` repeated, and whose image hash is its upper case:
 * `aPermutation("a")`. Two with different letters build different images.
 */
export function aPermutation(letter: string, hashed: Partial<HashedPermutation> = {}, resolved: Partial<Omit<ResolvedPermutation, "hashed">> = {}): ResolvedPermutation {
  return {
    hashed: {
      baseImage: "node",
      codeState: "empty",
      promptSet: "none",
      harnessModel: "robot/small",
      initialPrompt: "hello",
      hash: hashOf(letter),
      parameterHashes: { baseImage: "pb", codeState: "pc", promptSet: "pp", harnessModel: "ph", initialPrompt: "pi" },
      modelId: "small",
      imageHash: hashOf(letter.toUpperCase()),
      dockerfile: `FROM node\n# ${letter}\n`,
      resolved: {},
      ...hashed,
    },
    harness: { name: "robot", version: "1.0.0", modelId: "small" },
    harnessEnv: ["ROBOT_KEY"],
    runOptions: ["--init"],
    timeoutSeconds: 60,
    parameterFolders: {
      baseImage: "parameters/baseImages/node",
      codeState: "parameters/codeStates/empty",
      promptSet: "parameters/promptSets/none",
      harness: "parameters/harnessModels/robot",
    },
    ...resolved,
  };
}

/**
 * A resolved test case: `example`, of the task `greet`, with two permutations (`a` says hello, `b`
 * says hi), two iterations each, no image store and no runtime.
 */
export function aTestCaseConfig(overrides: Partial<TestCaseConfig> = {}): TestCaseConfig {
  const testCase = {
    baseImage: ["node"],
    codeState: ["empty"],
    promptSet: ["none"],
    harnessModel: ["robot/small"],
    task: "greet",
    initialPrompt: ["hello", "hi"],
    iterations: 2,
  } as unknown as TestCaseDeclaration;
  return {
    root: "/project/.thunderjar",
    name: "example",
    testCase,
    overrides: {},
    executionId: EXECUTION_ID,
    permutations: [aPermutation("a"), aPermutation("b", { initialPrompt: "hi" })],
    imagePrefix: "thunderjar",
    imageStore: null,
    build: { secrets: [], ssh: false, concurrency: 1 },
    runtime: null,
    timings: false,
    warnings: [],
    ...overrides,
  };
}

/**
 * The manifest `plan` makes of `aTestCaseConfig(config)`, with one container at a time, then
 * `overrides` over it: `aManifest({ concurrency: 2 }, { imageStore: AN_IMAGE_STORE })`.
 */
export function aManifest(overrides: Partial<Manifest> = {}, config: Partial<TestCaseConfig> = {}): Manifest {
  return { ...plan(aTestCaseConfig(config), { concurrency: 1 }), ...overrides };
}

/** Every dependency as its fake, for assertions, and `deps`, the same ones as a Dependencies. */
export type FakeDependencies = {
  deps: Dependencies;
  env: Env;
  clock: FakeClock;
  random: FakeRandom;
  fs: FakeFs;
  io: FakeIo;
  /** What both Dockers push to and pull from. */
  registry: FakeRegistry;
  hostDocker: FakeDocker;
  runtimeDocker: FakeDocker;
  commands: FakeCommandRunner;
  stores: FakeStores;
  /** The one store `stores` opens. */
  store: FakeRunDataStore;
  measurer: FakeMeasurer;
  state: FakeApplicationState<Manifest>;
  displayer: FakeDisplayer;
};

/**
 * A Dependencies made only of fakes: nothing touches the machine. The host's Docker and the
 * runtime's are two daemons over one registry, so a test can check which one each call went to.
 * The clock starts at START_TIME and moves only when the test advances it.
 *
 *   const { deps, runtimeDocker, clock } = fakeDependencies({ env: { variables: { ROBOT_KEY: "k" } } });
 */
export function fakeDependencies(options: { env?: Partial<Env> } = {}): FakeDependencies {
  const clock = new FakeClock(START_TIME);
  const env = FakeEnv({ cwd: "/project", ...options.env });
  const random = new FakeRandom(clock);
  const fs = new FakeFs();
  const io = new FakeIo();
  const registry = new FakeRegistry();
  const hostDocker = new FakeDocker(clock, registry);
  const runtimeDocker = new FakeDocker(clock, registry);
  const commands = new FakeCommandRunner();
  const stores = new FakeStores();
  const measurer = new FakeMeasurer();
  const state = new FakeApplicationState<Manifest>();
  const displayer = new FakeDisplayer();
  const deps: Dependencies = { env, clock, random, fs, io, hostDocker, runtimeDocker, commands, stores, measurer, state, displayer };
  return { deps, env, clock, random, fs, io, registry, hostDocker, runtimeDocker, commands, stores, store: stores.store, measurer, state, displayer };
}
