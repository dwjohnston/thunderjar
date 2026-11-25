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

import { describe, expect, test } from "bun:test";
import { ConfigError } from "../../config/loader.ts";
import { DockerBuildError, DockerContainerError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../services/Docker/errors.ts";
import { RunDataStoreError } from "../../store/runDataStore.ts";
import { ImageStoreLoginError } from "../imageStore.ts";
import { describeFailure } from "./describeFailure.ts";
import { RuntimeHookError } from "./runTestCase.ts";

const AT = { cwd: "/project" };

describe(describeFailure, () => {
  test("a config error is its problems, each after the first starting its own Error line", () => {
    expect(describeFailure(new ConfigError("no such test case", "no such task"), AT)).toBe("no such test case\nError: no such task");
    expect(describeFailure(new ConfigError("only one"), AT)).toBe("only one");
  });

  test("a missing login for the image store is said as it is", () => {
    const error = new ImageStoreLoginError("registry.example/acme/images", "registry.example", "not logged in");
    expect(describeFailure(error, AT)).toBe(error.message);
  });

  test("Docker that can't be reached means nothing can be run", () => {
    expect(describeFailure(new DockerUnavailableError("no daemon"), AT)).toBe("Docker can't be reached, so nothing can be run: no daemon");
  });

  test("a failed build names its image", () => {
    expect(describeFailure(new DockerBuildError("step 3 failed", "thunderjar-prerun:1a2b3c4d"), AT)).toBe("Building thunderjar-prerun:1a2b3c4d failed: step 3 failed");
  });

  test("a failed push says which login to check", () => {
    expect(describeFailure(new DockerPushError("denied", "ghcr.io/acme/images:prerun-h1a2b3c4d"), AT)).toBe(
      "Pushing ghcr.io/acme/images:prerun-h1a2b3c4d failed: denied\nCheck that your Docker login for ghcr.io can push to ghcr.io/acme/images: on ghcr.io, a token needs the write:packages scope.",
    );
  });

  test("a failed pull points at doctor, and no longer at --local", () => {
    const text = describeFailure(new DockerPullError("unauthorized", "ghcr.io/acme/images:prerun-h1a2b3c4d"), AT);
    expect(text).toBe(
      "The runtime couldn't pull ghcr.io/acme/images:prerun-h1a2b3c4d: unauthorized\nMake sure it can reach the image store's registry and is logged in to it. `thunderjar doctor` checks this.",
    );
  });

  test("a store that can't be used says whether anything had run, with its path as seen from where the command ran", () => {
    const error = new RunDataStoreError("/project/data/runs.sqlite", "disk full");
    expect(describeFailure(error, AT)).toBe(
      "Can't use the run data store, data/runs.sqlite, so nothing was run: disk full\nCheck it can be reached from here, or pass --data-dir to record in a local SQLite file instead.",
    );
    expect(describeFailure(error, { ...AT, started: true })).toContain("data/runs.sqlite, so the execution stopped: disk full");
  });

  test("a container error", () => {
    expect(describeFailure(new DockerContainerError("no such container"), AT)).toBe("Running or measuring a container failed: no such container");
  });

  test("a runtime hook that failed names the hook", () => {
    expect(describeFailure(new RuntimeHookError("no capacity", "beforeExecution"), AT)).toBe("The runtime's beforeExecution failed: no capacity");
  });

  test("anything else is its message, or itself as text", () => {
    expect(describeFailure(new Error("the cat sat on the keyboard"), AT)).toBe("the cat sat on the keyboard");
    expect(describeFailure("just a string", AT)).toBe("just a string");
  });
});
