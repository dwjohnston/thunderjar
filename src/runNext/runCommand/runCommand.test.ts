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
import { ConfigError } from "../../config/loader.ts";
import { DockerBuildError, DockerContainerError } from "../../docker/docker.ts";
import { RunDataStoreError } from "../../services/RunDataStore/RunDataStore.ts";
import { scenario } from "../../testing/scenario.ts";
import { agentRan, type FakeDependencies, fakeDependencies, RUN_STORE_LOCATION } from "../testing/fakeDependencies.ts";
import { resolveTestCase, runCommand, splitOptions } from "./runCommand.ts";

describe(splitOptions, () => {
  test("with no options: a full run, shown interactively, with no overrides", () => {
    expect(splitOptions({})).toEqual({ overrides: {}, mode: "full", output: "interactive" });
  });

  test("--dry-run is the dry-run mode", () => {
    expect(splitOptions({ dryRun: true }).mode).toBe("dry-run");
  });

  test("--build-only is the build-only mode", () => {
    expect(splitOptions({ buildOnly: true }).mode).toBe("build-only");
  });

  test("--json is the json output, whatever the mode", () => {
    expect(splitOptions({ json: true })).toEqual({ overrides: {}, mode: "full", output: "json" });
    expect(splitOptions({ json: true, dryRun: true })).toEqual({ overrides: {}, mode: "dry-run", output: "json" });
  });

  test("everything else is an override, but the image prefix", () => {
    const { overrides } = splitOptions({ iterations: 3, promptSet: ["glurk"], imagePrefix: "mine", dryRun: true, json: true });

    expect(overrides).toEqual({ iterations: 3, promptSet: ["glurk"] });
  });

  test("--dry-run with --build-only is a ConfigError", () => {
    expect(() => splitOptions({ dryRun: true, buildOnly: true })).toThrow(ConfigError);
  });
});

// `resolveTestCase` loads a real project from disk, so these run in the fixture project 0202. Its
// test case `example` is one permutation, run once, by a harness that needs FAKE_HARNESS_KEY.
// The key is too short to be worth searching the post-run image for.
const TEST_CASE = "example";

function setUp(): FakeDependencies {
  const deps = fakeDependencies({ env: { cwd: scenario("0202"), variables: { FAKE_HARNESS_KEY: "test-key" } } });
  deps.runtimeDocker.on("", agentRan());
  return deps;
}

const manifestOf = (deps: FakeDependencies) => deps.state.get().run.manifest;

describe(resolveTestCase, () => {
  test("reads the test case, its permutations and its measurements from the project", async () => {
    const config = await resolveTestCase(TEST_CASE, {}, setUp());

    expect(config.name).toBe(TEST_CASE);
    expect(config.root).toBe(`${scenario("0202")}/.thunderjar`);
    expect(config.task).toBe("is-prime");
    expect(config.imagePrefix).toBe("thunderjar");
    expect(config.imageStore).toBeNull();
    expect(config.runtime).toBeNull();
    expect(config.permutations).toHaveLength(1);
    expect(config.permutations[0]?.env).toEqual(["FAKE_HARNESS_KEY"]);
    expect(config.measurements.length).toBeGreaterThan(0);
  });

  test("applies the overrides and the image prefix", async () => {
    const config = await resolveTestCase(TEST_CASE, { iterations: 3, imagePrefix: "mine" }, setUp());

    expect(config.iterations).toBe(3);
    expect(config.overrides).toEqual({ iterations: 3 });
    expect(config.imagePrefix).toBe("mine");
  });

  test("a variable a harness needs being unset is a ConfigError", async () => {
    const deps = fakeDependencies({ env: { cwd: scenario("0202"), variables: {} } });

    await expect(resolveTestCase(TEST_CASE, {}, deps)).rejects.toBeInstanceOf(ConfigError);
  });
});

describe(runCommand, () => {
  describe("a dry run", () => {
    test("puts the manifest in the state, asks Docker nothing, and exits 0", async () => {
      const deps = setUp();

      const result = await runCommand(TEST_CASE, { dryRun: true }, deps);

      expect(result).toEqual({ exitCode: 0 });
      expect(manifestOf(deps)?.testCaseName).toBe(TEST_CASE);
      expect(manifestOf(deps)?.runs).toHaveLength(1);
      expect(deps.state.get().run.details?.mode).toBe("dry-run");
      expect(deps.hostDocker.calls).toEqual([]);
      expect(deps.runtimeDocker.calls).toEqual([]);
      expect(deps.io.stderr.text()).toBe("");
    });

    test("applies the overrides and the image prefix", async () => {
      const deps = setUp();

      await runCommand(TEST_CASE, { dryRun: true, iterations: 2, imagePrefix: "mine" }, deps);

      expect(manifestOf(deps)?.runs.map(({ container }) => container)).toEqual([
        `mine-run-${manifestOf(deps)?.executionId}-1-1`,
        `mine-run-${manifestOf(deps)?.executionId}-1-2`,
      ]);
    });
  });

  describe("the displayer", () => {
    test("is interactive by default", async () => {
      const deps = setUp();
      deps.displayer.mode = "json";

      await runCommand(TEST_CASE, { dryRun: true }, deps);

      expect<string>(deps.displayer.mode).toBe("interactive");
    });

    test("is set to json by --json", async () => {
      const deps = setUp();

      await runCommand(TEST_CASE, { dryRun: true, json: true }, deps);

      expect(deps.displayer.mode).toBe("json");
    });
  });

  describe("build only", () => {
    test("builds the image, runs nothing, and exits 0", async () => {
      const deps = setUp();

      const result = await runCommand(TEST_CASE, { buildOnly: true }, deps);

      expect(result).toEqual({ exitCode: 0 });
      expect(deps.runtimeDocker.callsOf("build")).toEqual([manifestOf(deps)!.permutations[0]!.prerunImage]);
      expect(deps.runtimeDocker.callsOf("run")).toEqual([]);
    });
  });

  describe("a full run", () => {
    test("builds, runs, records, and exits 0", async () => {
      const deps = setUp();

      const result = await runCommand(TEST_CASE, {}, deps);

      const manifest = manifestOf(deps)!;
      const [run] = manifest.runs;
      expect(result.exitCode).toBe(0);
      expect(result.records?.map(({ runId, outcome, exitCode }) => ({ runId, outcome, exitCode }))).toEqual([{ runId: run!.runId, outcome: "completed", exitCode: 0 }]);
      expect(deps.runtimeDocker.callsOf("build")).toEqual([run!.permutation.prerunImage]);
      expect(deps.runtimeDocker.runs[0]).toMatchObject({ image: run!.permutation.prerunImage, name: run!.container, options: { env: ["FAKE_HARNESS_KEY"] } });
      expect(deps.state.get().run.runs[run!.runId]?.status).toBe("committed");
      expect(deps.runStore.executions.get(manifest.executionId)?.status).toBe("complete");
      expect(deps.runStore.containerRuns.size).toBe(1);
      expect(deps.state.get().run.details?.finished?.recordedIn).toBe(RUN_STORE_LOCATION);
      expect(deps.io.stderr.text()).toBe("");
    });

    test("takes the task's measurements of the run", async () => {
      const deps = setUp();

      await runCommand(TEST_CASE, {}, deps);

      const [record] = [...deps.runStore.containerRuns.values()];
      expect(Object.keys(record!.result).sort()).toEqual(manifestOf(deps)!.config.measurements.map(({ name }) => name).sort());
    });

    test("leaves no container behind", async () => {
      const deps = setUp();

      await runCommand(TEST_CASE, {}, deps);

      expect(deps.runtimeDocker.containers.size).toBe(0);
    });

    test("an agent that exits non-zero: the execution is failed, and the exit code is 1", async () => {
      const deps = setUp();
      deps.runtimeDocker.on("", agentRan({ exitCode: 3 }));

      const result = await runCommand(TEST_CASE, {}, deps);

      expect(result.exitCode).toBe(1);
      expect(result.records?.[0]?.exitCode).toBe(3);
      expect(deps.runStore.executions.get(manifestOf(deps)!.executionId)?.status).toBe("failed");
    });

    test("a crashed run: the exit code is 1, and nothing is thrown", async () => {
      const deps = setUp();
      deps.runtimeDocker.fail("run", new DockerContainerError("daemon went away"));

      const result = await runCommand(TEST_CASE, {}, deps);

      expect(result.exitCode).toBe(1);
      expect(result.records?.[0]?.outcome).toBe("crashed");
    });
  });

  describe("an error an execution stops on", () => {
    test("a build failure is written to stderr, naming the image, with exit code 1", async () => {
      const deps = setUp();
      deps.runtimeDocker.fail("build", new DockerBuildError("exit code 17"));

      const result = await runCommand(TEST_CASE, {}, deps);

      const image = manifestOf(deps)!.permutations[0]!.prerunImage;
      expect(result).toEqual({ exitCode: 1 });
      expect(deps.io.stderr.text()).toBe(`Error: Building ${image} failed: exit code 17\n`);
      expect(deps.io.stdout.text()).toBe("");
      expect(deps.state.get().run.images[image]).toBe("failed");
      expect(deps.runtimeDocker.callsOf("run")).toEqual([]);
    });

    test("a run data store that can't be reached is written to stderr before anything is built", async () => {
      const deps = setUp();
      deps.runStore.failure = new RunDataStoreError(RUN_STORE_LOCATION, "connection refused");

      const result = await runCommand(TEST_CASE, {}, deps);

      expect(result).toEqual({ exitCode: 1 });
      expect(deps.io.stderr.text()).toStartWith("Error: Can't use the run data store");
      expect(deps.io.stderr.text()).toContain("so nothing was run: connection refused");
      expect(deps.runtimeDocker.calls).toEqual([]);
    });

    test("a ConfigError is thrown on, for the command to report", async () => {
      const deps = setUp();

      await expect(runCommand("no-such-test-case", {}, deps)).rejects.toBeInstanceOf(ConfigError);

      expect(deps.io.stderr.text()).toBe("");
    });

    test("any other error is thrown on", async () => {
      const deps = setUp();
      const bug = new TypeError("undefined is not a function");
      deps.runtimeDocker.fail("imagesIn", bug);

      await expect(runCommand(TEST_CASE, {}, deps)).rejects.toBe(bug);
    });
  });

  describe("interrupted", () => {
    test("Ctrl-C mid-run: no more runs start, its containers are removed, and the exit code is 130", async () => {
      const deps = setUp();
      deps.runtimeDocker.on("", () => {
        deps.io.interrupt();
        return agentRan();
      });

      const result = await runCommand(TEST_CASE, { iterations: 3 }, deps);

      const manifest = manifestOf(deps)!;
      expect(result.exitCode).toBe(130);
      expect(deps.runtimeDocker.runs.filter(({ name }) => manifest.runs.some((run) => run.container === name))).toHaveLength(1);
      expect(deps.runtimeDocker.callsOf("removeContainersNamed")).toContain(`thunderjar-run-${manifest.executionId}-`);
      expect(deps.state.get().run.details?.stopRequested).toBe("SIGINT");
      expect(deps.runStore.executions.get(manifest.executionId)?.status).toBe("failed");
      expect(deps.io.stderr.text()).toContain(`Interrupted (SIGINT): stopping execution ${manifest.executionId}'s containers.\n`);
    });

    test("SIGTERM exits 143", async () => {
      const deps = setUp();
      deps.runtimeDocker.on("", () => {
        deps.io.terminate();
        return agentRan();
      });

      const result = await runCommand(TEST_CASE, {}, deps);

      expect(result.exitCode).toBe(143);
    });

    test("stops listening once it's done", async () => {
      const deps = setUp();
      await runCommand(TEST_CASE, { dryRun: true }, deps);

      deps.io.interrupt();

      expect(deps.io.stderr.text()).toBe("");
    });
  });
});
