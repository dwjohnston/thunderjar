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

const edit = async (path: string, change: (text: string) => string) => {
  const text = await Bun.file(path).text();
  const changed = change(text);
  if (changed === text) throw new Error(`editing ${path} changed nothing`);
  await Bun.write(path, changed);
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

describe("hashPermutations", () => {
  const root = `${scenario("0202")}/.thunderjar`;

  test("gives each permutation a full SHA-256 hash, a hash per parameter, and its model ID", async () => {
    const sha = expect.stringMatching(/^[0-9a-f]{64}$/);
    expect(await hashPermutations(root, TWO_PAIRS)).toEqual(
      expandPermutations(TWO_PAIRS).map((permutation) => ({
        ...permutation,
        hash: sha,
        parameterHashes: { baseImage: sha, codeState: sha, promptSet: sha, harnessModel: sha, initialPrompt: sha },
        modelId: permutation.harnessModel.startsWith("fake-harness-alpha") ? "fake-model-small-001" : "fake-model-large-001",
      })),
    );
  });

  test("permutations sharing a parameter share its parameter hash", async () => {
    const [snerkAlphaPlain, snerkAlphaTerse, , , glurkAlphaPlain] = await hashPermutations(root, TWO_PAIRS);

    expect(snerkAlphaPlain?.parameterHashes.promptSet).toBe(snerkAlphaTerse?.parameterHashes.promptSet as string);
    expect(snerkAlphaPlain?.parameterHashes.promptSet).not.toBe(glurkAlphaPlain?.parameterHashes.promptSet as string);
    expect(snerkAlphaPlain?.parameterHashes.harnessModel).toBe(glurkAlphaPlain?.parameterHashes.harnessModel as string);
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
    const all = await hashes(root, { ...TWO_PAIRS, harnessModel: [...TWO_PAIRS.harnessModel, "fake-harness-beta@1.0.0/fake-model-small"] });

    expect(all).toHaveLength(2 * 3 * 2);
    expect(new Set(all).size).toBe(all.length);
  });

  test("renaming a parameter's folder or file keeps its hash", async () => {
    await using copy = await copyScenarioProject("0202");
    const parameters = `${copy.dir}/.thunderjar/test-case-parameters`;
    await Bun.$`mv ${parameters}/baseImages/node20 ${parameters}/baseImages/node20-renamed`.quiet();
    await Bun.$`mv ${parameters}/codeStates/baseline ${parameters}/codeStates/baseline-renamed`.quiet();
    await Bun.$`mv ${parameters}/promptSets/snerk ${parameters}/promptSets/snerk-renamed`.quiet();
    await Bun.$`mv ${parameters}/harnessModels/fake-harness-alpha ${parameters}/harnessModels/fake-harness-renamed`.quiet();
    await Bun.$`mv ${parameters}/tasks/is-prime/initial-prompts/plain.ts ${parameters}/tasks/is-prime/initial-prompts/plain-renamed.ts`.quiet();

    expect(
      await hashes(`${copy.dir}/.thunderjar`, {
        ...ONE,
        baseImage: ["node20-renamed"],
        codeState: ["baseline-renamed"],
        promptSet: ["snerk-renamed"],
        harnessModel: ["fake-harness-renamed@1.0.0/fake-model-small"],
        initialPrompt: ["plain-renamed"],
      }),
    ).toEqual(await hashes(root, ONE));
  });

  test("adding a model or a version to a harness changes no hash", async () => {
    await using copy = await copyScenarioProject("0202");
    const harness = `${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-harness-alpha`;
    await edit(`${harness}/models.ts`, (text) => text.replace(/\n\}\);/, '\n  "fake-model-huge": "fake-model-huge-001",\n});'));
    await edit(`${harness}/versions.ts`, (text) => text.replace(/\n\}\);/, '\n  "2.0.0": { version: "2.0.0" },\n});'));

    expect(await hashes(`${copy.dir}/.thunderjar`, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
  });

  test.each([
    ["model's ID", "models.ts", "fake-model-large-001", "fake-model-large-002", "fake-model-large"],
    ["version's entry", "versions.ts", '{ version: "1.0.0" }', '{ version: "1.0.1" }', "@1.0.0/"],
  ])("changing the chosen %s changes only the hashes of the permutations using it", async (_, file, from, to, used) => {
    const testCase = { ...TWO_PAIRS, harnessModel: [...TWO_PAIRS.harnessModel, "fake-harness-beta@1.0.0/fake-model-small"] };
    await using copy = await copyScenarioProject("0202");
    const before = await hashPermutations(root, testCase);
    await edit(`${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-harness-beta/${file}`, (text) => text.replace(from, to));

    const after = await hashes(`${copy.dir}/.thunderjar`, testCase);

    before.forEach((permutation, i) => {
      const changed = permutation.harnessModel.startsWith("fake-harness-beta") && permutation.harnessModel.includes(used);
      if (changed) expect(after[i]).not.toBe(permutation.hash);
      else expect(after[i]).toBe(permutation.hash);
    });
  });

  // Each edit is to a file of the declaration of one parameter of the first permutation, on its own axis.
  test.each([
    ["baseImage", "baseImages/node20/index.ts"],
    ["codeState", "codeStates/baseline/index.ts"],
    ["promptSet", "promptSets/snerk/index.ts"],
    ["harnessModel", "harnessModels/fake-harness-alpha/index.ts"],
    ["initialPrompt", "tasks/is-prime/initial-prompts/plain.ts"],
  ] as const)("editing a file of a %s's declaration changes the hash of each permutation naming it", async (axis, file) => {
    await using copy = await copyScenarioProject("0202");
    const before = await hashPermutations(root, TWO_PAIRS);
    await edit(`${copy.dir}/.thunderjar/test-case-parameters/${file}`, (text) => `${text}\n// edited\n`);

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

  describe("a symlink in a parameter folder", () => {
    const linkedCopy = async () => {
      const copy = await copyScenarioProject("0202");
      const snerk = `${copy.dir}/.thunderjar/test-case-parameters/promptSets/snerk`;
      await Bun.write(`${copy.dir}/shared/AGENTS.md`, "# Shared\n");
      await Bun.write(`${copy.dir}/shared/skills/review/SKILL.md`, "# Review\n");
      await Bun.$`ln -s ../../../../shared/AGENTS.md ${snerk}/AGENTS.md`.quiet();
      await Bun.$`ln -s ../../../../shared/skills ${snerk}/skills`.quiet();
      return { copy, root: `${copy.dir}/.thunderjar`, snerk };
    };

    test("is hashed by its target's content, under the link's path", async () => {
      await using copy = await copyScenarioProject("0202");
      const snerk = `${copy.dir}/.thunderjar/test-case-parameters/promptSets/snerk`;
      await Bun.write(`${snerk}/AGENTS.md`, "# Shared\n");
      await Bun.write(`${snerk}/skills/review/SKILL.md`, "# Review\n");
      const linked = await linkedCopy();
      await using _ = linked.copy;

      expect(await hashes(linked.root, ONE)).toEqual(await hashes(`${copy.dir}/.thunderjar`, ONE));
      expect(await hashes(linked.root, ONE)).not.toEqual(await hashes(root, ONE));
    });

    test("editing a linked file's target changes the hash", async () => {
      const { copy, root: linkedRoot } = await linkedCopy();
      await using _ = copy;
      const before = await hashes(linkedRoot, ONE);
      await Bun.write(`${copy.dir}/shared/AGENTS.md`, "# Shared, edited\n");

      expect(await hashes(linkedRoot, ONE)).not.toEqual(before);
    });

    test("editing a file inside a linked folder changes the hash", async () => {
      const { copy, root: linkedRoot } = await linkedCopy();
      await using _ = copy;
      const before = await hashes(linkedRoot, ONE);
      await Bun.write(`${copy.dir}/shared/skills/review/SKILL.md`, "# Review, edited\n");

      expect(await hashes(linkedRoot, ONE)).not.toEqual(before);
    });

    test("a link back to a folder being walked adds nothing", async () => {
      const { copy, root: linkedRoot, snerk } = await linkedCopy();
      await using _ = copy;
      const before = await hashes(linkedRoot, ONE);
      await Bun.$`ln -s .. ${copy.dir}/shared/skills/review/up`.quiet();
      await Bun.$`ln -s . ${snerk}/self`.quiet();

      expect(await hashes(linkedRoot, ONE)).toEqual(before);
    });

    test("a dangling link is hashed by its path", async () => {
      const { copy, root: linkedRoot, snerk } = await linkedCopy();
      await using _ = copy;
      const before = await hashes(linkedRoot, ONE);
      await Bun.$`ln -s missing.md ${snerk}/GONE.md`.quiet();

      expect(await hashes(linkedRoot, ONE)).not.toEqual(before);
    });
  });

  test("the task's measurements are not part of any hash", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(`${copy.dir}/.thunderjar/test-case-parameters/tasks/is-prime/measurements/extra.ts`, "export {};\n");

    expect(await hashes(`${copy.dir}/.thunderjar`, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
  });
});
