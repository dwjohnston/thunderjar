/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { findThunderjarRoot } from "../config/loader.ts";
import { loadTestCase } from "../config/testCase.ts";
import { scenario } from "../testing/scenario.ts";
import { planExecution } from "./planExecution.ts";
import { hydratePlan, planData } from "./runnerSpec.ts";

describe("a plan sent to a runner", () => {
  test("survives being sent as JSON, without its harnesses' functions, which the runner loads again", async () => {
    const root = await findThunderjarRoot(scenario("0202"));
    const plan = await planExecution(root, await loadTestCase(root, "two-harnesses"), "01JEXECUTION", undefined, { env: { FAKE_HARNESS_KEY: "k" } } as never);

    const sent = JSON.parse(JSON.stringify(planData(plan))) as ReturnType<typeof planData>;

    expect(sent.permutations.every((permutation) => !("harness" in permutation) && !("collectTokenCosts" in permutation))).toBe(true);
    const hydrated = await hydratePlan(root, sent);
    expect(planData(hydrated)).toEqual(planData(plan));
    for (const [index, permutation] of hydrated.permutations.entries()) {
      const original = plan.permutations[index]!;
      // The same functions, by what they do.
      expect(typeof permutation.collectTokenCosts).toBe("function");
      expect(permutation.harness.collectReply?.toString()).toBe(original.harness.collectReply?.toString());
      expect(permutation.collectTokenCosts("{}", { version: permutation.version, modelId: permutation.modelId })).toEqual(
        original.collectTokenCosts("{}", { version: original.version, modelId: original.modelId }),
      );
    }
  });

  test("a harness the runner's project doesn't have is a config error", async () => {
    const root = await findThunderjarRoot(scenario("0202"));
    const plan = planData(await planExecution(root, await loadTestCase(root, "two-harnesses"), "01JEXECUTION"));
    const other = await findThunderjarRoot(scenario("0201"));

    expect(hydratePlan(other, plan)).rejects.toThrow(/harnessModels/);
  });
});
