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

// How to use FakeRuntimeHooks: pass it where a RuntimeHooks goes, then read which hooks were run.
import { describe, expect, test } from "bun:test";
import { FakeRuntimeHooks } from "./FakeRuntimeHooks.ts";
import { RuntimeHookError, type RunFacts, type RuntimeHooks } from "./RuntimeHooks.ts";

const facts: RunFacts = { executionId: "party-1", concurrency: 2, containers: 6 };

/** Code under test: sets up, does the job, and always tidies up. */
async function withSetUp(hooks: RuntimeHooks, job: () => void): Promise<void> {
  await hooks.run("beforeExecution", ["lights", "on"], facts);
  try {
    job();
  } finally {
    await hooks.run("afterExecution", ["lights", "off"], facts);
  }
}

describe(FakeRuntimeHooks, () => {
  test("runs nothing, and records each hook it was asked to run, in order", async () => {
    const hooks = new FakeRuntimeHooks();

    await withSetUp(hooks, () => {});

    expect(hooks.ran).toEqual([
      { hook: "beforeExecution", command: ["lights", "on"], facts },
      { hook: "afterExecution", command: ["lights", "off"], facts },
    ]);
  });

  test("a hook set to fail throws a RuntimeHookError with its reason, and is still recorded", async () => {
    const hooks = new FakeRuntimeHooks();
    hooks.failing.beforeExecution = "the bulb blew";
    let jobRan = false;

    const failure = await withSetUp(hooks, () => void (jobRan = true)).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RuntimeHookError);
    expect((failure as RuntimeHookError).message).toBe("the bulb blew");
    expect((failure as RuntimeHookError).hook).toBe("beforeExecution");
    expect(jobRan).toBe(false);
    expect(hooks.ran.map(({ hook }) => hook)).toEqual(["beforeExecution"]);
  });

  test("only the hook set to fail does", async () => {
    const hooks = new FakeRuntimeHooks();
    hooks.failing.afterExecution = "the switch is stuck";

    await expect(withSetUp(hooks, () => {})).rejects.toThrow("the switch is stuck");

    expect(hooks.ran.map(({ hook }) => hook)).toEqual(["beforeExecution", "afterExecution"]);
  });
});
