import { expect, test } from "bun:test";
import type { TestCaseDeclaration } from "./declarations.ts";
import { expandPermutations, matrixShape } from "./permutations.ts";

const testCase = (overrides: Partial<TestCaseDeclaration> = {}): TestCaseDeclaration => ({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
  ...overrides,
});

test("a 1/1/1/1/1 test case has one permutation", () => {
  expect(matrixShape(testCase())).toEqual([1, 1, 1, 1, 1]);
  expect(expandPermutations(testCase())).toEqual([
    {
      baseImage: "node20",
      codeState: "baseline",
      promptSet: "snerk",
      harnessModel: "claude-code@2.1.283/haiku-4-5",
      initialPrompt: "plain",
    },
  ]);
});

test("the shape counts each axis in declaration field order", () => {
  const shape = matrixShape(
    testCase({
      baseImage: ["a", "b", "c", "d", "e"],
      codeState: ["a", "b", "c", "d"],
      promptSet: ["a", "b", "c"],
      harnessModel: ["a", "b"],
      initialPrompt: ["a"],
    }),
  );

  expect(shape).toEqual([5, 4, 3, 2, 1]);
});

// spec/055-declaring-test-cases.md#a-test-case-is-a-matrix
test("walks the arrays in field order, the last varying fastest", () => {
  const permutations = expandPermutations(
    testCase({ baseImage: ["b1", "b2"], codeState: ["c1", "c2"], promptSet: ["p1", "p2"], harnessModel: ["h1", "h2"], initialPrompt: ["i1", "i2"] }),
  );

  expect(permutations).toHaveLength(32);
  expect(permutations.map((p) => [p.baseImage, p.codeState, p.promptSet, p.harnessModel, p.initialPrompt].join(" ")).slice(0, 5)).toEqual([
    "b1 c1 p1 h1 i1",
    "b1 c1 p1 h1 i2",
    "b1 c1 p1 h2 i1",
    "b1 c1 p1 h2 i2",
    "b1 c1 p2 h1 i1",
  ]);
  expect(permutations.at(-1)).toEqual({ baseImage: "b2", codeState: "c2", promptSet: "p2", harnessModel: "h2", initialPrompt: "i2" });
});
