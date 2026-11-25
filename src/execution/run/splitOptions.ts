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

// Level 1's first step: what `run` was given, split into the three kinds the plan names.
import { ConfigError } from "../../config/loader.ts";
import { givenOverrides } from "../../config/overrides.ts";
import type { RunOptions, SplitOptions } from "./types.ts";

/**
 * `options` as overrides (merged into the TestCaseConfig), a mode (passed to level 2) and an
 * output (the displayer's). No option goes to two. Throws a ConfigError for `--dry-run` with
 * `--build-only`: each says where to stop.
 */
export function splitOptions(options: RunOptions): SplitOptions {
  if (options.dryRun && options.buildOnly) {
    throw new ConfigError("--dry-run and --build-only can't be given together: --dry-run stops before anything is built.");
  }
  return {
    overrides: {
      testCase: givenOverrides(options),
      ...(options.concurrency !== undefined && { concurrency: options.concurrency }),
      ...(options.timings !== undefined && { timings: options.timings }),
      ...(options.imagePrefix !== undefined && { imagePrefix: options.imagePrefix }),
      ...(options.dataDir !== undefined && { dataDir: options.dataDir }),
    },
    mode: options.dryRun ? "dry-run" : options.buildOnly ? "build-only" : "full",
    output: options.json ? "json" : "interactive",
  };
}
