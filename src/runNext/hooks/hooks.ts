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

// A runtime's `beforeExecution` and `afterExecution` commands, run once each around an execution.
import { type RunFacts, runRuntimeHook } from "../../execution/runtimeHooks.ts";
import { moduleLogger } from "../../log/logger.ts";
import type { Manifest, TestCaseConfig } from "../types.ts";

const log = moduleLogger("runNext");

export type Hook = "beforeExecution" | "afterExecution";

// By manifest, so each runs once for an execution, whoever asks: level 2, or level 1 when interrupted.
const ran = new WeakMap<Manifest, Set<Hook>>();

/**
 * Runs the runtime's `hook` for the execution `manifest` plans, if `config` has one and it hasn't
 * run for it yet. Throws a RuntimeHookError if it fails.
 */
export async function runHook(hook: Hook, manifest: Manifest, config: TestCaseConfig): Promise<void> {
  const command = config.hooks[hook];
  if (command === undefined) return;
  const done = ran.get(manifest) ?? new Set<Hook>();
  ran.set(manifest, done);
  if (done.has(hook)) return;
  done.add(hook);
  const facts: RunFacts = { executionId: manifest.executionId, concurrency: manifest.concurrency, containers: manifest.runs.length };
  log.info({ hook, command, ...facts }, "running the runtime's hook");
  await runRuntimeHook(hook, command, facts);
}
