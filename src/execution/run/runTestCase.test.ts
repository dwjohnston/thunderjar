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

import { describe, expect, it } from "bun:test";
import { DockerBuildError } from "../../services/Docker/errors.ts";
import { RuntimeHookError, runTestCase } from "./runTestCase.ts";
import { A_RUNTIME, aTestCaseConfig, EXECUTION_ID, type FakeDependencies, fakeAgent, fakeDependencies } from "./testSupport.ts";
import type { ExecutionResult, RunMode, TestCaseConfig } from "./types.ts";

// aTestCaseConfig(): permutations `a` and `b`, two iterations each, built locally.
const PRERUN_A = "thunderjar-prerun:AAAAAAAA";
const PRERUN_B = "thunderjar-prerun:BBBBBBBB";

const HOOKS = { beforeExecution: ["rent", "a-server"], afterExecution: ["return", "the-server"] };
const withHooks = (overrides: Partial<TestCaseConfig> = {}) => aTestCaseConfig({ runtime: { ...A_RUNTIME, ...HOOKS }, ...overrides });

function fakesWith(env: Parameters<typeof fakeDependencies>[0] = {}): FakeDependencies {
  const fakes = fakeDependencies(env);
  fakes.runtimeDocker.on("", fakeAgent());
  return fakes;
}

/** Runs the test case, moving the clock on so its agents can finish. */
async function runIt(fakes: FakeDependencies, config = aTestCaseConfig(), mode?: RunMode, shouldStop?: () => boolean): Promise<ExecutionResult | undefined> {
  const running = runTestCase(config, fakes.deps, mode, shouldStop === undefined ? {} : { shouldStop });
  running.catch(() => {});
  await fakes.clock.advance(120_000);
  return running;
}

/** Each phase the state went through, in order. */
const phasesOf = (fakes: FakeDependencies) =>
  fakes.state
    .history()
    .map((state) => state.run.phase)
    .filter((phase, index, all) => phase !== undefined && phase !== all[index - 1]);

describe("runTestCase: a dry run", () => {
  it("writes the manifest to the state and stops, touching neither Docker nor the store", async () => {
    const fakes = fakesWith();

    const result = await runIt(fakes, withHooks(), "dry-run");

    expect(result).toBeUndefined();
    const { manifest, executionId, phase } = fakes.state.get().run;
    expect(manifest?.runs.length).toBe(4);
    expect(manifest?.images.map(({ image }) => image)).toEqual([PRERUN_A, PRERUN_B]);
    expect(executionId).toBe(EXECUTION_ID);
    expect(phase).toBe("planned");
    expect(fakes.hostDocker.calls).toEqual([]);
    expect(fakes.runtimeDocker.calls).toEqual([]);
    expect(fakes.commands.calls).toEqual([]);
    expect(fakes.stores.opened).toEqual([]);
  });

  it("shows the config's warnings", async () => {
    const fakes = fakesWith();

    await runIt(fakes, aTestCaseConfig({ warnings: ["an old setting is no longer used"] }), "dry-run");

    expect(fakes.state.get().run.warnings).toEqual(["an old setting is no longer used"]);
  });
});

describe("runTestCase: build only", () => {
  it("builds the prerun images on the runtime and stops: no container, no record, no hook", async () => {
    const fakes = fakesWith();

    const result = await runIt(fakes, withHooks(), "build-only");

    expect(result).toBeUndefined();
    expect(fakes.runtimeDocker.builds.map(({ image }) => image)).toEqual([PRERUN_A, PRERUN_B]);
    expect(fakes.state.get().run.images).toEqual({ [PRERUN_A]: "ready", [PRERUN_B]: "ready" });
    expect(fakes.runtimeDocker.called("run")).toEqual([]);
    expect(fakes.store.writes).toEqual([]);
    expect(fakes.commands.calls).toEqual([]);
    expect(phasesOf(fakes)).toEqual(["planned", "building", "done"]);
  });
});

describe("runTestCase: a full run", () => {
  it("plans, builds, runs and returns what was recorded", async () => {
    const fakes = fakesWith();

    const result = await runIt(fakes);

    expect(result?.execution.status).toBe("complete");
    expect(result?.containerRuns.length).toBe(4);
    expect(fakes.runtimeDocker.builds.length).toBe(2);
    expect(phasesOf(fakes)).toEqual(["planned", "building", "running", "done"]);
  });

  it("is full by default", async () => {
    const fakes = fakesWith();

    const running = runTestCase(aTestCaseConfig(), fakes.deps);
    await fakes.clock.advance(120_000);

    expect((await running)?.containerRuns.length).toBe(4);
  });

  it("stops before running anything, if asked to while its images were built", async () => {
    const fakes = fakesWith();

    const result = await runIt(fakes, withHooks(), "full", () => fakes.runtimeDocker.builds.length > 0);

    expect(result).toBeUndefined();
    expect(fakes.runtimeDocker.called("run")).toEqual([]);
    expect(fakes.store.writes).toEqual([]);
    expect(fakes.commands.calls.map(({ command }) => command)).toEqual([HOOKS.beforeExecution, HOOKS.afterExecution]);
  });
});

describe("runTestCase: how many containers at once", () => {
  const concurrencyOf = async (config: Partial<TestCaseConfig>, env: { concurrency?: number } = {}) => {
    const fakes = fakesWith({ env });
    await runIt(fakes, aTestCaseConfig(config), "dry-run");
    return fakes.state.get().run.manifest?.concurrency;
  };

  it("is --concurrency, else THUNDERJAR_CONCURRENCY, else the runtime's, else one", async () => {
    expect(await concurrencyOf({ concurrency: 5, runtime: A_RUNTIME }, { concurrency: 4 })).toBe(5);
    expect(await concurrencyOf({ runtime: A_RUNTIME }, { concurrency: 4 })).toBe(4);
    expect(await concurrencyOf({ runtime: A_RUNTIME })).toBe(3);
    expect(await concurrencyOf({})).toBe(1);
  });
});

describe("runTestCase: the runtime's hooks", () => {
  it("runs beforeExecution before anything is built and afterExecution once the execution is recorded, each told about the execution", async () => {
    const fakes = fakesWith();
    const seen: { command: string; builds: number; status: string | undefined }[] = [];
    const run = fakes.commands.run.bind(fakes.commands);
    fakes.commands.run = (command, env) => {
      seen.push({ command: command.join(" "), builds: fakes.runtimeDocker.builds.length, status: fakes.store.executions[0]?.status });
      return run(command, env);
    };

    await runIt(fakes, withHooks({ concurrency: 2 }));

    expect(seen).toEqual([
      { command: "rent a-server", builds: 0, status: undefined },
      { command: "return the-server", builds: 2, status: "complete" },
    ]);
    const told = { THUNDERJAR_EXECUTION_ID: EXECUTION_ID, THUNDERJAR_CONCURRENCY: "2", THUNDERJAR_CONTAINERS: "4" };
    expect(fakes.commands.calls).toEqual([
      { command: HOOKS.beforeExecution, env: told },
      { command: HOOKS.afterExecution, env: told },
    ]);
  });

  it("does nothing else if beforeExecution fails: its last line of stderr is why", async () => {
    const fakes = fakesWith();
    fakes.commands.fail(HOOKS.beforeExecution, { exitCode: 3, stderr: "looking for a server\nnone left\n" });

    const error = await runIt(fakes, withHooks()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RuntimeHookError);
    expect(error).toMatchObject({ hook: "beforeExecution", message: "none left" });
    expect(fakes.runtimeDocker.calls).toEqual([]);
    expect(fakes.commands.calls.length).toBe(1);
  });

  it("says how a hook exited if it wrote nothing", async () => {
    const fakes = fakesWith();
    fakes.commands.fail(HOOKS.beforeExecution, { exitCode: 3 });

    const error = await runIt(fakes, withHooks()).catch((e: unknown) => e);

    expect((error as Error).message).toBe("`rent a-server` exited 3");
  });

  it("still runs afterExecution when a build fails, and throws the build's error", async () => {
    const fakes = fakesWith();
    fakes.runtimeDocker.failBuild(PRERUN_A, "no space left");

    const error = await runIt(fakes, withHooks()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DockerBuildError);
    expect(fakes.commands.calls.map(({ command }) => command)).toEqual([HOOKS.beforeExecution, HOOKS.afterExecution]);
  });

  it("throws the build's error even if afterExecution fails too, which becomes a warning", async () => {
    const fakes = fakesWith();
    fakes.runtimeDocker.failBuild(PRERUN_A, "no space left");
    fakes.commands.fail(HOOKS.afterExecution, { stderr: "couldn't return it" });

    const error = await runIt(fakes, withHooks()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DockerBuildError);
    expect(fakes.state.get().run.warnings).toEqual(["The runtime's afterExecution failed: couldn't return it"]);
  });

  it("throws if afterExecution fails after the execution, with what was recorded", async () => {
    const fakes = fakesWith();
    fakes.commands.fail(HOOKS.afterExecution, { stderr: "couldn't return it" });

    const error = await runIt(fakes, withHooks()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RuntimeHookError);
    expect(error).toMatchObject({ hook: "afterExecution", message: "couldn't return it" });
    expect((error as RuntimeHookError).result?.execution.status).toBe("complete");
  });

  it("runs no hook when the runtime has none", async () => {
    const fakes = fakesWith();

    await runIt(fakes, aTestCaseConfig({ runtime: A_RUNTIME }));

    expect(fakes.commands.calls).toEqual([]);
  });
});
