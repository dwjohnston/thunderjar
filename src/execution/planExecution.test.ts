import { expect, test } from "bun:test";
import { FOLDER } from "../config/loader.ts";
import { loadTestCase } from "../config/testCase.ts";
import { scenario } from "../testing/scenario.ts";
import { planExecution } from "./planExecution.ts";

const EXECUTION_ID = "01aryz6s410000000000000000";

test("every postrun image of an execution carries its ID, and each permutation's iterations share its command", async () => {
  const root = `${scenario("0202")}/${FOLDER}`;
  const { executionId, permutations } = await planExecution(root, await loadTestCase(root, "is-prime-baseline"), EXECUTION_ID);

  expect(executionId).toBe(EXECUTION_ID);
  expect(permutations.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  for (const { number, iterations } of permutations) {
    expect(iterations.map((i) => i.postrunImage)).toEqual(
      [1, 2, 3, 4, 5].map((i) => `thunderjar-postrun:${EXECUTION_ID}-${number}-${i}`),
    );
    expect(new Set(iterations.map((i) => i.command)).size).toBe(1);
  }
});
