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

import { describe, expect, test } from "bun:test";
import { DockerBuildError } from "../../docker/docker.ts";
import { ImageStoreLoginError } from "../../execution/imageStore.ts";
import { RunDataStoreError } from "../../services/RunDataStore/RunDataStore.ts";
import { RuntimeHookError } from "../../services/RuntimeHooks/RuntimeHooks.ts";
import { agentRan, fakeDependencies, fakeTestCase, IMAGE_STORE, loggedSteps, RUN_STORE_LOCATION, START } from "../testing/fakeDependencies.ts";
import { runTestCase } from "./runTestCase.ts";

const EXECUTION_ID = "01KFA1BGZ0AAAAAAAAAAAAAAAA";
const IMAGE = "tj-prerun:aaaaaaaa";
const RUN_ID = `${EXECUTION_ID}-1-1`;

/** Dependencies whose next execution ID is `EXECUTION_ID`, and whose agents all exit 0. */
function setUp() {
  const deps = fakeDependencies();
  deps.random.setUlids(EXECUTION_ID);
  deps.runtimeDocker.on("", agentRan());
  return deps;
}

const hooked = { command: ["docker", "--context", "cloud"], beforeExecution: ["cloud", "start"], afterExecution: ["cloud", "stop"] };

describe(runTestCase, () => {
  describe("planning", () => {
    test("plans with a new execution ID and the settings' concurrency", async () => {
      const deps = setUp();
      deps.settings.concurrency = 4;

      await runTestCase(fakeTestCase({ iterations: 2 }), deps, "dry-run");

      const manifest = deps.state.get().run.manifest;
      expect(manifest?.executionId).toBe(EXECUTION_ID);
      expect(manifest?.concurrency).toBe(4);
      expect(manifest?.runs.map(({ runId }) => runId)).toEqual([`${EXECUTION_ID}-1-1`, `${EXECUTION_ID}-1-2`]);
    });
  });

  describe("a dry run", () => {
    test("only sets the manifest and the mode: Docker is asked nothing", async () => {
      const deps = setUp();

      const records = await runTestCase(fakeTestCase({ imageStore: IMAGE_STORE, runtime: hooked }), deps, "dry-run");

      expect(records).toBeUndefined();
      expect(deps.state.get().run.manifest?.testCaseName).toBe("greeting");
      expect(deps.state.get().run.details).toEqual({ mode: "dry-run", startedAt: START, log: [], phases: {} });
      expect(deps.hostDocker.calls).toEqual([]);
      expect(deps.runtimeDocker.calls).toEqual([]);
    });

    test("runs no hook, and records nothing", async () => {
      const deps = setUp();

      await runTestCase(fakeTestCase({ runtime: hooked }), deps, "dry-run");

      expect(deps.runtimeHooks.ran).toEqual([]);
      expect(deps.runStore.executions.size).toBe(0);
    });

    test("needs neither a registry login nor the run data store", async () => {
      const deps = setUp();
      deps.hostDocker.logins.clear();
      deps.runStore.failure = new RunDataStoreError(RUN_STORE_LOCATION, "connection refused");

      await runTestCase(fakeTestCase({ imageStore: IMAGE_STORE }), deps, "dry-run");

      expect(deps.state.get().run.manifest).toBeDefined();
    });
  });

  describe("build only", () => {
    test("builds the images, and stops", async () => {
      const deps = setUp();

      const records = await runTestCase(fakeTestCase(), deps, "build-only");

      expect(records).toBeUndefined();
      expect(deps.runtimeDocker.callsOf("build")).toEqual([IMAGE]);
      expect(deps.runtimeDocker.callsOf("run")).toEqual([]);
      expect(deps.state.get().run.images).toEqual({ [IMAGE]: "ready" });
      expect(deps.state.get().run.details?.mode).toBe("build-only");
    });

    test("records no execution, runs no hook, and doesn't need the run data store", async () => {
      const deps = setUp();
      deps.runStore.failure = new RunDataStoreError(RUN_STORE_LOCATION, "connection refused");

      await runTestCase(fakeTestCase({ runtime: hooked }), deps, "build-only");

      expect(deps.runtimeHooks.ran).toEqual([]);
      expect(deps.runStore.executions.size).toBe(0);
      expect(deps.runtimeDocker.callsOf("build")).toEqual([IMAGE]);
    });

    test("checks the image store's login first", async () => {
      const deps = setUp();
      deps.hostDocker.logins.clear();

      await expect(runTestCase(fakeTestCase({ imageStore: IMAGE_STORE }), deps, "build-only")).rejects.toBeInstanceOf(ImageStoreLoginError);

      expect(deps.runtimeDocker.calls).toEqual([]);
    });
  });

  describe("a full run", () => {
    test("is the default: builds, runs, and returns the records", async () => {
      const deps = setUp();

      const records = await runTestCase(fakeTestCase(), deps);

      expect(records?.map(({ runId, outcome }) => ({ runId, outcome }))).toEqual([{ runId: RUN_ID, outcome: "completed" }]);
      expect(deps.state.get().run.details?.mode).toBe("full");
      expect(deps.runStore.executions.get(EXECUTION_ID)?.status).toBe("complete");
      expect(deps.state.get().run.details?.finished?.execution.status).toBe("complete");
    });

    test("every image is ready before the first container starts", async () => {
      const deps = setUp();

      await runTestCase(fakeTestCase({ permutations: ["a", "b"] }), deps);

      expect(deps.runtimeDocker.calls.filter((call) => /^(build|run) /.test(call)).map((call) => call.split(" ")[0])).toEqual(["build", "build", "run", "run"]);
    });

    test("with an image store, checks the host's login for its registry", async () => {
      const deps = setUp();

      await runTestCase(fakeTestCase({ imageStore: IMAGE_STORE }), deps);

      expect(deps.hostDocker.calls[0]).toBe("checkLogin registry.example.com");
      expect(deps.runtimeDocker.callsOf("checkLogin")).toEqual([]);
    });

    test("without hooks, runs none", async () => {
      const deps = setUp();

      await runTestCase(fakeTestCase({ runtime: { command: ["docker", "--context", "cloud"] } }), deps);

      expect(deps.runtimeHooks.ran).toEqual([]);
    });

    test("runs beforeExecution, then everything else, then afterExecution", async () => {
      const deps = setUp();

      await runTestCase(fakeTestCase({ runtime: hooked }), deps);

      expect(deps.runtimeHooks.ran.map(({ hook, command }) => ({ hook, command }))).toEqual([
        { hook: "beforeExecution", command: ["cloud", "start"] },
        { hook: "afterExecution", command: ["cloud", "stop"] },
      ]);
      expect(loggedSteps(deps)).toEqual([
        "beforeExecution:running",
        "beforeExecution:done",
        `${IMAGE}:building`,
        `${IMAGE}:built`,
        `${RUN_ID}:started`,
        `${RUN_ID}:ran`,
        `${RUN_ID}:done`,
        "afterExecution:running",
        "afterExecution:done",
      ]);
    });

    test("tells each hook the execution's ID, concurrency and how many containers it has", async () => {
      const deps = setUp();
      deps.settings.concurrency = 2;

      await runTestCase(fakeTestCase({ runtime: hooked, iterations: 3 }), deps);

      const facts = { executionId: EXECUTION_ID, concurrency: 2, containers: 3 };
      expect(deps.runtimeHooks.ran.map((ran) => ran.facts)).toEqual([facts, facts]);
    });

    test("afterExecution runs even when a build fails, and the failure is thrown on", async () => {
      const deps = setUp();
      deps.runtimeDocker.fail("build", new DockerBuildError("exit code 1"));

      await expect(runTestCase(fakeTestCase({ runtime: hooked }), deps)).rejects.toBeInstanceOf(DockerBuildError);

      expect(deps.runtimeHooks.ran.map(({ hook }) => hook)).toEqual(["beforeExecution", "afterExecution"]);
      expect(deps.runtimeDocker.callsOf("run")).toEqual([]);
    });

    test("afterExecution runs even when the execution fails", async () => {
      const deps = setUp();
      deps.runtimeDocker.on("", agentRan({ exitCode: 1 }));

      await runTestCase(fakeTestCase({ runtime: hooked }), deps);

      expect(deps.runStore.executions.get(EXECUTION_ID)?.status).toBe("failed");
      expect(deps.runtimeHooks.ran.map(({ hook }) => hook)).toEqual(["beforeExecution", "afterExecution"]);
    });

    test("beforeExecution failing: nothing else runs, not even afterExecution", async () => {
      const deps = setUp();
      deps.runtimeHooks.failing.beforeExecution = "exit code 3";

      const failure = await runTestCase(fakeTestCase({ runtime: hooked }), deps).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(RuntimeHookError);
      expect((failure as RuntimeHookError).hook).toBe("beforeExecution");
      expect(deps.runtimeHooks.ran.map(({ hook }) => hook)).toEqual(["beforeExecution"]);
      expect(deps.runtimeDocker.calls).toEqual([]);
      expect(loggedSteps(deps)).toEqual(["beforeExecution:running", "beforeExecution:failed"]);
    });

    test("afterExecution failing fails a run that otherwise succeeded", async () => {
      const deps = setUp();
      deps.runtimeHooks.failing.afterExecution = "exit code 3";

      await expect(runTestCase(fakeTestCase({ runtime: hooked }), deps)).rejects.toBeInstanceOf(RuntimeHookError);

      expect(deps.runStore.executions.get(EXECUTION_ID)?.status).toBe("complete");
      expect(loggedSteps(deps).at(-1)).toBe("afterExecution:failed");
    });
  });

  describe("no login for the image store's registry", () => {
    test("throws an ImageStoreLoginError, saying how to log in", async () => {
      const deps = setUp();
      deps.hostDocker.logins.clear();

      const failure = await runTestCase(fakeTestCase({ imageStore: IMAGE_STORE }), deps).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ImageStoreLoginError);
      expect((failure as ImageStoreLoginError).host).toBe("registry.example.com");
      expect((failure as ImageStoreLoginError).message).toContain("docker login registry.example.com");
    });

    test("nothing is built, run or recorded, and no hook runs", async () => {
      const deps = setUp();
      deps.hostDocker.logins.clear();

      await runTestCase(fakeTestCase({ imageStore: IMAGE_STORE, runtime: hooked }), deps).catch(() => {});

      expect(deps.hostDocker.calls).toEqual(["checkLogin registry.example.com"]);
      expect(deps.runtimeDocker.calls).toEqual([]);
      expect(deps.runtimeHooks.ran).toEqual([]);
      expect(deps.runStore.executions.size).toBe(0);
      expect(deps.state.get().run.manifest).toBeUndefined();
    });
  });

  describe("a run data store that can't be reached", () => {
    test("throws its error before anything is built, and no hook runs", async () => {
      const deps = setUp();
      deps.runStore.failure = new RunDataStoreError(RUN_STORE_LOCATION, "connection refused");

      await expect(runTestCase(fakeTestCase({ runtime: hooked }), deps)).rejects.toBeInstanceOf(RunDataStoreError);

      expect(deps.runtimeDocker.calls).toEqual([]);
      expect(deps.runtimeHooks.ran).toEqual([]);
      expect(deps.state.get().run.manifest).toBeUndefined();
    });
  });
});
