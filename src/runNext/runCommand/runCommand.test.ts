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

import { describe, expect, test } from "bun:test";
import { ConfigError } from "../../config/loader.ts";
import { DockerLoginError } from "../../docker/docker.ts";
import { ImageStoreLoginError } from "../../execution/imageStore.ts";
import { RunDataStoreError } from "../../services/RunDataStore/RunDataStore.ts";
import { scenario } from "../../testing/scenario.ts";
import { config, type Fakes, fakes } from "../testing/fixtures.ts";
import { preflight, runCommand, splitOptions } from "./runCommand.ts";

describe(splitOptions, () => {
  test("overrides go to the config, the mode to level 2, and the output format to the displayer", () => {
    expect(splitOptions({ iterations: 3, harnessModel: ["a/b"], json: true, dryRun: true, concurrency: 4, imagePrefix: "tj", timings: true })).toEqual({
      overrides: { iterations: 3, harnessModel: ["a/b"] },
      mode: "dry-run",
      output: "json",
    });
  });

  test("with neither mode option, it's a full run, shown interactively", () => {
    expect(splitOptions({})).toEqual({ overrides: {}, mode: "full", output: "interactive" });
    expect(splitOptions({ buildOnly: true }).mode).toBe("build-only");
  });

  test("--dry-run and --build-only together is a config error", () => {
    expect(() => splitOptions({ dryRun: true, buildOnly: true })).toThrow(ConfigError);
  });
});

describe(preflight, () => {
  test("without an image store, asks Docker for no login, and checks the run data store", async () => {
    const deps = fakes();

    await preflight(config(), deps);

    expect(deps.hostDocker.calls).toEqual([]);
  });

  test("with an image store, the host checks its login for the registry", async () => {
    const deps = fakes();

    await preflight(config({ imageStore: { repository: "ghcr.io/acme/images" } }), deps);

    expect(deps.hostDocker.calls).toEqual(["checkLogin ghcr.io"]);
    expect(deps.runtimeDocker.calls).toEqual([]);
  });

  test("no login for the registry is an ImageStoreLoginError", async () => {
    const deps = fakes();
    deps.hostDocker.failNext("checkLogin", new DockerLoginError("not logged in"));

    expect(preflight(config({ imageStore: { repository: "ghcr.io/acme/images" } }), deps)).rejects.toThrow(ImageStoreLoginError);
  });

  test("a build secret whose variable is unset is a config error", async () => {
    const deps = fakes();

    expect(preflight(config({ build: { secrets: [{ id: "npm", env: "NPM_TOKEN" }], ssh: false, concurrency: 1 } }), deps)).rejects.toThrow(ConfigError);
  });

  test("a run data store that can't be used is thrown before anything is built", async () => {
    const deps = fakes();
    deps.runStore.failure = new RunDataStoreError("/data/runs.sqlite", "not a database");

    expect(preflight(config(), deps)).rejects.toThrow(RunDataStoreError);
  });
});

/** Fakes for running scenario 0201's `example` test case: one run, no image store. */
function inScenario(): Fakes {
  const deps = fakes();
  deps.env.cwd = scenario("0201");
  return deps;
}

/** An agent that runs until its container is removed. */
const hangs = () => new Promise<never>(() => {});

describe(runCommand, () => {
  test("listens for Ctrl+C only while it runs", async () => {
    const deps = inScenario();
    let listening: boolean | undefined;
    deps.runtimeDocker.onRun("-1-1", () => {
      listening = deps.interrupts.listening;
      return {};
    });

    expect((await runCommand("example", {}, deps)).exitCode).toBe(0);

    expect(listening).toBe(true);
    expect(deps.interrupts.listening).toBe(false);
  });

  test("the 1st Ctrl+C while its agent runs abandons the run, and exits 130", async () => {
    const deps = inScenario();
    deps.runtimeDocker.onRun("-1-1", () => {
      deps.interrupts.press();
      return hangs();
    });

    const { exitCode, records } = await runCommand("example", {}, deps);

    expect(exitCode).toBe(130);
    expect(records?.map(({ outcome }) => outcome)).toEqual(["abandoned"]);
    expect(deps.state.get().run).toMatchObject({ stopping: "windDown", error: "Interrupted (SIGINT)", execution: { status: "failed" } });
  });

  test("a wind down that finishes on its own still exits 130", async () => {
    const deps = inScenario();
    const open = deps.runtimeDocker.openShellSession.bind(deps.runtimeDocker);
    deps.runtimeDocker.openShellSession = async (...args: Parameters<typeof deps.runtimeDocker.openShellSession>) => {
      deps.interrupts.press();
      return open(...args);
    };

    const { exitCode, records } = await runCommand("example", {}, deps);

    expect(exitCode).toBe(130);
    expect(records?.map(({ outcome, error }) => [outcome, error])).toEqual([["completed", undefined]]);
  });

  test("the 2nd Ctrl+C removes the execution's containers, and exits 130 without waiting", async () => {
    const deps = inScenario();
    deps.runtimeDocker.onRun("-1-1", () => {
      deps.interrupts.press();
      deps.interrupts.press();
      return hangs();
    });

    const { exitCode } = await runCommand("example", {}, deps);

    expect(exitCode).toBe(130);
    expect(deps.runtimeDocker.calls.some((call) => call.startsWith("removeContainersNamed thunderjar-run-"))).toBe(true);
    expect(deps.state.get().run.stopping).toBe("forceQuit");
    expect(deps.io.stderr.text()).toContain("Interrupted (SIGINT): stopping execution");
  });

  test("SIGTERM force quits at once, and exits 143", async () => {
    const deps = inScenario();
    deps.runtimeDocker.onRun("-1-1", () => {
      deps.interrupts.terminate();
      return hangs();
    });

    const { exitCode } = await runCommand("example", {}, deps);

    expect(exitCode).toBe(143);
    expect(deps.state.get().run).toMatchObject({ stopping: "forceQuit", error: "Interrupted (SIGTERM)" });
    expect(deps.interrupts.listening).toBe(false);
  });

  test("in --dry-run, the 1st Ctrl+C exits 130", async () => {
    const deps = inScenario();
    deps.displayer.start = () => deps.interrupts.press();

    const { exitCode } = await runCommand("example", { dryRun: true }, deps);

    expect(exitCode).toBe(130);
    expect(deps.runtimeDocker.calls).toEqual([]);
  });
});
