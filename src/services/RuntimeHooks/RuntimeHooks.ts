/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// A runtime's `beforeExecution` and `afterExecution` commands, as a service, so a test can pass a
// FakeRuntimeHooks in place of running a command.
import { type RunFacts, runRuntimeHook } from "../../execution/runtimeHooks.ts";

export type { RunFacts };
export { RuntimeHookError } from "../../execution/runtimeHooks.ts";

export interface RuntimeHooks {
  /** Runs `command`, the runtime's `hook`, told `facts` through its environment. Throws a RuntimeHookError if it fails. */
  run(hook: "beforeExecution" | "afterExecution", command: string[], facts: RunFacts): Promise<void>;
}

/** Runs each hook as a command on this machine. Built only at an entry point. */
export function createRuntimeHooksService(): RuntimeHooks {
  return { run: runRuntimeHook };
}
