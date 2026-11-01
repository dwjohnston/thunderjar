import { describe, expect, test } from "bun:test";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { copyScenarioProject } from "../testing/cli.ts";
import { scenario } from "../testing/scenario.ts";
import { abbreviateHash, expandPermutations, hashPermutations, matrixShape } from "./permutations.ts";

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

const hashes = async (root: string, testCase: TestCaseDeclaration) =>
  (await hashPermutations(root, testCase)).map((permutation) => permutation.hash);

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

describe("hashPermutations", () => {
  const root = `${scenario("0202")}/.thunderjar`;

  test("gives each permutation a full SHA-256 hash", async () => {
    expect(await hashPermutations(root, TWO_PAIRS)).toEqual(
      expandPermutations(TWO_PAIRS).map((permutation) => ({ ...permutation, hash: expect.stringMatching(/^[0-9a-f]{64}$/) })),
    );
  });

  test("is stable: the same files give the same hashes, wherever they are", async () => {
    await using copy = await copyScenarioProject("0202");

    expect(await hashes(root, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
    expect(await hashes(`${copy.dir}/.thunderjar`, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
  });

  test("a permutation's hash doesn't depend on the test case it's in", async () => {
    const [first] = await hashes(root, TWO_PAIRS);

    expect(await hashes(root, ONE)).toEqual([first as string]);
  });

  test("every permutation differing on any axis has its own hash", async () => {
    await using copy = await copyScenarioProject("0202");
    const parameters = `${copy.dir}/.thunderjar/test-case-parameters`;
    // Under other names, with the same files: the name is part of the hash.
    await Bun.$`cp -R ${parameters}/baseImages/node20 ${parameters}/baseImages/node20-again`.quiet();
    await Bun.$`cp -R ${parameters}/codeStates/baseline ${parameters}/codeStates/baseline-again`.quiet();
    const all = await hashes(`${copy.dir}/.thunderjar`, {
      ...TWO_PAIRS,
      baseImage: ["node20", "node20-again"],
      codeState: ["baseline", "baseline-again"],
      harnessModel: [...TWO_PAIRS.harnessModel, "fake-harness-beta@1.0.0/fake-model-small"],
    });

    expect(all).toHaveLength(2 * 2 * 2 * 3 * 2);
    expect(new Set(all).size).toBe(all.length);
  });

  // Each edit is to a file of the declaration of one parameter of the first permutation, on its own axis.
  test.each([
    ["baseImage", "baseImages/node20/index.ts"],
    ["codeState", "codeStates/baseline/index.ts"],
    ["promptSet", "promptSets/snerk/index.ts"],
    ["harnessModel", "harnessModels/fake-harness-alpha/versions.ts"],
    ["initialPrompt", "tasks/is-prime/initial-prompts/plain.ts"],
  ] as const)("editing a file of a %s's declaration changes the hash of each permutation naming it", async (axis, file) => {
    await using copy = await copyScenarioProject("0202");
    const before = await hashPermutations(root, TWO_PAIRS);
    const edited = Bun.file(`${copy.dir}/.thunderjar/test-case-parameters/${file}`);
    await Bun.write(edited, `${await edited.text()}\n// edited\n`);

    const after = await hashes(`${copy.dir}/.thunderjar`, TWO_PAIRS);

    before.forEach((permutation, i) => {
      if (permutation[axis] === before[0]?.[axis]) expect(after[i]).not.toBe(permutation.hash);
      else expect(after[i]).toBe(permutation.hash);
    });
  });

  test("a file added beside a declaration changes its hash", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(`${copy.dir}/.thunderjar/test-case-parameters/promptSets/snerk/AGENTS.md`, "# Snerk\n");

    expect(await hashes(`${copy.dir}/.thunderjar`, ONE)).not.toEqual(await hashes(root, ONE));
  });

  test("the task's measurements are not part of any hash", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(`${copy.dir}/.thunderjar/test-case-parameters/tasks/is-prime/measurements/extra.ts`, "export {};\n");

    expect(await hashes(`${copy.dir}/.thunderjar`, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
  });
});
