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
import { RunDataStoreError } from "../../store/runDataStore.ts";
import { createRunControl, type RunControl, STOP_SETTLE_MS } from "./runControl.ts";
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
async function runIt(fakes: FakeDependencies, config = aTestCaseConfig(), mode?: RunMode, control?: RunControl): Promise<ExecutionResult | undefined> {
  const running = runTestCase(config, fakes.deps, mode, control);
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

  it("opens the run data store once", async () => {
    const fakes = fakesWith();

    await runIt(fakes, aTestCaseConfig({ dataDir: "elsewhere" }));

    expect(fakes.stores.opened).toEqual(["elsewhere"]);
  });
});

describe("runTestCase: a run data store that can't be used", () => {
  it("is found before the runtime is started or anything is built", async () => {
    const fakes = fakesWith();
    fakes.store.failCheckWith("no such table");

    const error = await runIt(fakes, withHooks()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RunDataStoreError);
    expect(fakes.commands.calls).toEqual([]);
    expect(fakes.hostDocker.calls).toEqual([]);
    expect(fakes.runtimeDocker.calls).toEqual([]);
  });

  it("is found as soon if it can't be opened", async () => {
    const fakes = fakesWith();
    fakes.stores.open = async () => {
      throw new Error("THUNDERJAR_DB_URL is not set");
    };

    await expect(runIt(fakes, withHooks())).rejects.toThrow("THUNDERJAR_DB_URL is not set");
    expect(fakes.commands.calls).toEqual([]);
    expect(fakes.runtimeDocker.calls).toEqual([]);
  });

  it("isn't opened for a build only", async () => {
    const fakes = fakesWith();
    fakes.store.failCheckWith("no such table");

    await runIt(fakes, withHooks(), "build-only");

    expect(fakes.stores.opened).toEqual([]);
    expect(fakes.runtimeDocker.builds.length).toBe(2);
  });
});

describe("runTestCase: asked to stop", () => {
  /** Starts it with builds that take `buildMs`, asks it to stop a second in, and says how long after that it returned. */
  async function stopWhileBuilding(fakes: FakeDependencies, mode: RunMode, buildMs: number, force = false) {
    fakes.runtimeDocker.takes("build", buildMs);
    const control = createRunControl();
    let endedAt: number | undefined;
    const running = runTestCase(withHooks(), fakes.deps, mode, control);
    running.then(
      () => (endedAt = fakes.clock.now()),
      () => {},
    );
    await fakes.clock.advance(1_000);
    const stoppedAt = fakes.clock.now();
    control.stop();
    if (force) control.force();
    await fakes.clock.advance(1_800_000);
    return { result: await running, took: (endedAt ?? Number.POSITIVE_INFINITY) - stoppedAt };
  }

  it("builds no other image and runs nothing, if asked while its images were built, and still runs afterExecution", async () => {
    const fakes = fakesWith();

    const { result, took } = await stopWhileBuilding(fakes, "full", 5_000);

    expect(result).toBeUndefined();
    // The build under way was let finish.
    expect(took).toBe(4_000);
    expect(fakes.runtimeDocker.builds.map(({ image }) => image)).toEqual([PRERUN_A]);
    expect(fakes.runtimeDocker.called("run")).toEqual([]);
    expect(fakes.store.writes).toEqual([]);
    expect(fakes.commands.calls.map(({ command }) => command)).toEqual([HOOKS.beforeExecution, HOOKS.afterExecution]);
  });

  it("waits for a build under way no longer than the settle time, then runs afterExecution", async () => {
    const fakes = fakesWith();

    const { result, took } = await stopWhileBuilding(fakes, "full", 600_000);

    expect(result).toBeUndefined();
    expect(took).toBe(STOP_SETTLE_MS);
    expect(fakes.runtimeDocker.builds.map(({ image }) => image)).toEqual([PRERUN_A]);
    expect(fakes.commands.calls.map(({ command }) => command)).toEqual([HOOKS.beforeExecution, HOOKS.afterExecution]);
  });

  it("doesn't wait at all when forced", async () => {
    const fakes = fakesWith();

    const { took } = await stopWhileBuilding(fakes, "full", 600_000, true);

    expect(took).toBe(0);
    expect(fakes.commands.calls.map(({ command }) => command)).toEqual([HOOKS.beforeExecution, HOOKS.afterExecution]);
  });

  it("builds no other image for a build only either, and waits no longer", async () => {
    const fakes = fakesWith();

    const { took } = await stopWhileBuilding(fakes, "build-only", 600_000);

    expect(took).toBe(STOP_SETTLE_MS);
    expect(fakes.runtimeDocker.builds.map(({ image }) => image)).toEqual([PRERUN_A]);
    expect(fakes.commands.calls).toEqual([]);
  });

  it("does nothing but the hooks if asked while beforeExecution ran", async () => {
    const fakes = fakesWith();
    const control = createRunControl();
    const run = fakes.commands.run.bind(fakes.commands);
    fakes.commands.run = (command, env) => {
      control.stop();
      return run(command, env);
    };

    const result = await runIt(fakes, withHooks(), "full", control);

    expect(result).toBeUndefined();
    expect(fakes.runtimeDocker.calls).toEqual([]);
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
