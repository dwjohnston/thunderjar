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

// Level 1: from the command line to a resolved test case, a mode and an output format.
import type { Overrides } from "../config/overrides.ts";
import { runTestCase } from "./runTestCase.ts";
import type { Dependencies, OutputFormat, RunMode, RunOptions, RunRecord, TestCaseConfig } from "./types.ts";

export async function runCommand(testCaseName: string, options: RunOptions, deps: Dependencies): Promise<RunRecord[] | undefined> {
  const { overrides, mode, output } = splitOptions(options);
  const { displayer } = deps;

  displayer.setMode(output);
  displayer.start();
  try {
    const testCaseConfig = await resolveTestCase(testCaseName, overrides, deps);
    return await runTestCase(testCaseConfig, deps, mode);
  } finally {
    displayer.stop(); // interactive: final frame; json: write the result to stdout
  }
}

/** Overrides go into the config, the mode goes to level 2, the output format only to the displayer. */
export function splitOptions(options: RunOptions): { overrides: Overrides; mode: RunMode; output: OutputFormat } {
  const { dryRun, buildOnly, json, ...overrides } = options;
  if (dryRun && buildOnly) throw new Error("--dry-run and --build-only can't be used together.");
  return {
    overrides,
    mode: dryRun ? "dry-run" : buildOnly ? "build-only" : "full",
    output: json ? "json" : "interactive",
  };
}

/** Finds the test case on the filesystem and applies the overrides. */
export async function resolveTestCase(
  _testCaseName: string,
  _overrides: Overrides,
  _deps: Pick<Dependencies, "env" | "fs">,
): Promise<TestCaseConfig> {
  throw new Error("Not implemented: resolveTestCase");
}
