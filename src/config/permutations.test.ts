import { describe, expect, test } from "bun:test";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { abbreviateHash, expandPermutations, matrixShape } from "./permutations.ts";

const ONE: TestCaseDeclaration = {
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
};

const TWO_PAIRS: TestCaseDeclaration = {
  ...ONE,
  promptSet: ["snerk", "glurk"],
  harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small", "fake-harness-beta@1.0.0/fake-model-large"],
  initialPrompt: ["plain", "terse"],
};

describe("matrixShape", () => {
  test("is the size of each axis, in declaration field order", () => {
    expect(matrixShape(ONE)).toEqual([1, 1, 1, 1, 1]);
    expect(matrixShape({ ...TWO_PAIRS, baseImage: ["node20", "node22", "node24"] })).toEqual([3, 1, 2, 2, 2]);
  });
});

describe("expandPermutations", () => {
  const permutation = {
    baseImage: "node20",
    codeState: "baseline",
    promptSet: "snerk",
    harnessModel: "fake-harness-alpha@1.0.0/fake-model-small",
    initialPrompt: "plain",
  };

  test("names one of each axis per permutation", () => {
    expect(expandPermutations(ONE)).toEqual([permutation]);
  });

  test("lists the cross product, the last axis varying fastest", () => {
    expect(expandPermutations({ ...ONE, promptSet: ["snerk", "glurk"], initialPrompt: ["plain", "terse"] })).toEqual([
      { ...permutation, promptSet: "snerk", initialPrompt: "plain" },
      { ...permutation, promptSet: "snerk", initialPrompt: "terse" },
      { ...permutation, promptSet: "glurk", initialPrompt: "plain" },
      { ...permutation, promptSet: "glurk", initialPrompt: "terse" },
    ]);
  });
});

describe("abbreviateHash", () => {
  test("is the first 8 characters", () => {
    expect(abbreviateHash("0123456789abcdef")).toBe("01234567");
  });
});
