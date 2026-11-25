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
import { ConfigError } from "../../config/loader.ts";
import { splitOptions } from "./splitOptions.ts";

describe("splitOptions", () => {
  it("is a full, interactive run with no overrides when nothing is given", () => {
    expect(splitOptions({})).toEqual({ overrides: { testCase: {} }, mode: "full", output: "interactive" });
  });

  it("puts the test case's overridable fields in overrides.testCase, without those left unset", () => {
    const { overrides } = splitOptions({ iterations: 3, promptSet: ["a", "b"], baseImage: undefined });

    expect(overrides.testCase).toEqual({ promptSet: ["a", "b"], iterations: 3 });
  });

  it("puts the machine-level options beside them", () => {
    const { overrides } = splitOptions({ concurrency: 4, timings: true, imagePrefix: "mine", dataDir: "/data" });

    expect(overrides).toEqual({ testCase: {}, concurrency: 4, timings: true, imagePrefix: "mine", dataDir: "/data" });
  });

  it("takes the mode from --dry-run and --build-only", () => {
    expect(splitOptions({ dryRun: true }).mode).toBe("dry-run");
    expect(splitOptions({ buildOnly: true }).mode).toBe("build-only");
    expect(splitOptions({ dryRun: false, buildOnly: false }).mode).toBe("full");
  });

  it("refuses --dry-run with --build-only", () => {
    expect(() => splitOptions({ dryRun: true, buildOnly: true })).toThrow(ConfigError);
  });

  it("takes the output from --json", () => {
    expect(splitOptions({ json: true }).output).toBe("json");
    expect(splitOptions({ json: false }).output).toBe("interactive");
  });

  it("sends no option to two places", () => {
    const { overrides } = splitOptions({ dryRun: true, json: true, iterations: 2, concurrency: 2 });

    expect(Object.keys(overrides).sort()).toEqual(["concurrency", "testCase"]);
    expect(Object.keys(overrides.testCase)).toEqual(["iterations"]);
  });
});
