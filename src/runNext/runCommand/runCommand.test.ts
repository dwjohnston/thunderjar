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
import { config, fakes } from "../testing/fixtures.ts";
import { preflight, splitOptions } from "./runCommand.ts";

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
