import { describe, expect, test } from "bun:test";
import type { TestCaseDeclaration } from "../api/declarations.ts";
import { FOLDER } from "../config/loader.ts";
import { expandPermutations, type HashedPermutation } from "../config/permutations.ts";
import { loadTestCase } from "../config/testCase.ts";
import { copyScenarioProject } from "../testing/cli.ts";
import { scenario } from "../testing/scenario.ts";
import { hashPermutations, hostExec } from "./hashPermutations.ts";

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

/** Beta on both its models. */
const TWO_MODELS: TestCaseDeclaration = { ...ONE, harnessModel: ["fake-harness-beta@1.0.0/fake-model-small", "fake-harness-beta@1.0.0/fake-model-large"] };

const AXES = ["baseImage", "codeState", "promptSet", "harnessModel", "initialPrompt"] as const;

const root = `${scenario("0202")}/${FOLDER}`;

const hashes = async (dir: string, testCase: TestCaseDeclaration) => (await hashPermutations(dir, testCase)).map((permutation) => permutation.hash);

const edit = async (path: string, change: (text: string) => string) => {
  const text = await Bun.file(path).text();
  const changed = change(text);
  if (changed === text) throw new Error(`editing ${path} changed nothing`);
  await Bun.write(path, changed);
};

/** A copy of 0202, its `.thunderjar/` folder, and where its parameters are. */
const copy0202 = async () => {
  const copy = await copyScenarioProject("0202");
  return { copy, root: `${copy.dir}/${FOLDER}`, parameters: `${copy.dir}/${FOLDER}/test-case-parameters` };
};

/** Which of each permutation's hashes differ between `before` and `after`: its parameter hashes, its hash, and its image hash. */
const changes = (before: HashedPermutation[], after: HashedPermutation[]) =>
  before.map((permutation, i) => {
    const other = after[i] as HashedPermutation;
    return {
      parameters: AXES.filter((axis) => permutation.parameterHashes[axis] !== other.parameterHashes[axis]),
      hash: permutation.hash !== other.hash,
      image: permutation.imageHash !== other.imageHash,
    };
  });

const UNCHANGED = { parameters: [], hash: false, image: false };

describe("hashPermutations", () => {
  test("gives each permutation a full SHA-256 hash, a hash per parameter, its model ID, an image hash and its Dockerfile", async () => {
    const sha = expect.stringMatching(/^[0-9a-f]{64}$/);
    expect(await hashPermutations(root, TWO_PAIRS)).toEqual(
      expandPermutations(TWO_PAIRS).map((permutation) => ({
        ...permutation,
        hash: sha,
        parameterHashes: { baseImage: sha, codeState: sha, promptSet: sha, harnessModel: sha, initialPrompt: sha },
        modelId: permutation.harnessModel.startsWith("fake-harness-alpha") ? "fake-model-small-001" : "fake-model-large-001",
        imageHash: sha,
        dockerfile: expect.stringMatching(/^FROM node:20-bookworm\n/),
        resolved: {},
      })),
    );
  });

  test("each permutation's Dockerfile is its parameters' fragments", async () => {
    const testCase = await loadTestCase(root, "is-prime-baseline");
    const dockerfiles = (await hashPermutations(root, testCase)).map((permutation) => permutation.dockerfile);

    expect(dockerfiles[0]).toBe(
      [
        "FROM node:20-bookworm",
        "RUN npm install --global bun@1.3.14",
        "WORKDIR /workspace",
        'RUN echo "Write small functions, and say what each one is for." > /workspace/FAKE_INSTRUCTIONS.md',
        'RUN echo "install fake-harness-alpha@1.0.0"',
        "",
      ].join("\n"),
    );
    expect(new Set(dockerfiles).size).toBe(4);
  });

  test("permutations sharing a parameter share its parameter hash", async () => {
    const [snerkAlphaPlain, snerkAlphaTerse, , , glurkAlphaPlain] = await hashPermutations(root, TWO_PAIRS);

    expect(snerkAlphaPlain?.parameterHashes.promptSet).toBe(snerkAlphaTerse?.parameterHashes.promptSet as string);
    expect(snerkAlphaPlain?.parameterHashes.promptSet).not.toBe(glurkAlphaPlain?.parameterHashes.promptSet as string);
    expect(snerkAlphaPlain?.parameterHashes.harnessModel).toBe(glurkAlphaPlain?.parameterHashes.harnessModel as string);
  });

  test("is stable: the same declarations give the same hashes, wherever they are", async () => {
    await using copy = await copyScenarioProject("0202");

    expect(await hashes(root, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
    expect(await hashes(`${copy.dir}/${FOLDER}`, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
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

  test("two models of one harness share a prerun image, but not a hash", async () => {
    const [small, large] = await hashPermutations(root, TWO_MODELS);

    expect(small?.imageHash).toBe(large?.imageHash as string);
    expect(small?.parameterHashes).toEqual(large?.parameterHashes as HashedPermutation["parameterHashes"]);
    expect(small?.hash).not.toBe(large?.hash as string);
  });

  test("two initial prompts share a prerun image when neither has a fragment", async () => {
    const [plain, terse] = await hashPermutations(root, { ...ONE, initialPrompt: ["plain", "terse"] });

    expect(plain?.imageHash).toBe(terse?.imageHash as string);
    expect(plain?.hash).not.toBe(terse?.hash as string);
  });

  test("renaming a parameter's folder or file keeps its hash", async () => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    await Bun.$`mv ${parameters}/baseImages/node20 ${parameters}/baseImages/node20-renamed`.quiet();
    await Bun.$`mv ${parameters}/codeStates/baseline ${parameters}/codeStates/baseline-renamed`.quiet();
    await Bun.$`mv ${parameters}/promptSets/snerk ${parameters}/promptSets/snerk-renamed`.quiet();
    await Bun.$`mv ${parameters}/harnessModels/fake-harness-alpha ${parameters}/harnessModels/fake-harness-renamed`.quiet();
    await Bun.$`mv ${parameters}/tasks/is-prime/initial-prompts/plain.ts ${parameters}/tasks/is-prime/initial-prompts/plain-renamed.ts`.quiet();

    expect(
      await hashes(copied, {
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
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    const harness = `${parameters}/harnessModels/fake-harness-alpha`;
    await edit(`${harness}/models.ts`, (text) => text.replace(/\n\}\);/, '\n  "fake-model-huge": "fake-model-huge-001",\n});'));
    await edit(`${harness}/versions.ts`, (text) => text.replace(/\n\}\);/, '\n  "2.0.0": { version: "2.0.0" },\n});'));

    expect(await hashes(copied, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
  });

  test("changing the chosen model's ID changes only the hashes of the permutations using it, and no image", async () => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    const before = await hashPermutations(root, TWO_MODELS);
    await edit(`${parameters}/harnessModels/fake-harness-beta/models.ts`, (text) => text.replace("fake-model-large-001", "fake-model-large-002"));

    expect(changes(before, await hashPermutations(copied, TWO_MODELS))).toEqual([UNCHANGED, { parameters: [], hash: true, image: false }]);
  });

  // An edit to a comment of each parameter's declaration, on its own axis.
  test.each([
    ["baseImage", "baseImages/node20/index.ts"],
    ["codeState", "codeStates/baseline/index.ts"],
    ["promptSet", "promptSets/snerk/index.ts"],
    ["harnessModel", "harnessModels/fake-harness-alpha/index.ts"],
    ["initialPrompt", "tasks/is-prime/initial-prompts/plain.ts"],
  ] as const)("editing a comment in a %s's declaration changes no hash", async (_axis, file) => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    await edit(`${parameters}/${file}`, (text) => `// A comment, edited.\n${text}\n// Another.\n`);

    expect(await hashPermutations(copied, TWO_PAIRS)).toEqual(await hashPermutations(root, TWO_PAIRS));
  });

  // A change to what each parameter of the first permutation outputs, on its own axis.
  test.each([
    ["baseImage", "baseImages/node20/index.ts", "bun@1.3.14", "bun@1.3.15", true],
    ["promptSet", "promptSets/snerk/index.ts", "Write small functions", "Write tiny functions", true],
    ["harnessModel", "harnessModels/fake-harness-alpha/index.ts", "install fake-harness-alpha", "set up fake-harness-alpha", true],
    ["harnessModel", "harnessModels/fake-harness-alpha/index.ts", "'// @ts-ignore'", "'// @ts-expect-error'", false],
    ["harnessModel", "harnessModels/fake-harness-alpha/index.ts", 'requiredEnv: ["FAKE_HARNESS_KEY"]', 'requiredEnv: ["FAKE_HARNESS_TOKEN"]', false],
    ["initialPrompt", "tasks/is-prime/initial-prompts/plain.ts", "timeoutSeconds: 600", "timeoutSeconds: 601", false],
  ] as const)("changing what a %s outputs changes only its parameter hash (%s: %s)", async (axis, file, from, to, image) => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    const before = await hashPermutations(root, TWO_PAIRS);
    await edit(`${parameters}/${file}`, (text) => text.replace(from, to));

    const after = await hashPermutations(copied, TWO_PAIRS);

    changes(before, after).forEach((changed, i) => {
      const uses = before[i]?.[axis] === before[0]?.[axis];
      expect(changed).toEqual(uses ? { parameters: [axis], hash: true, image } : UNCHANGED);
    });
  });

  test("changing a code state's commit changes only the code state's hash", async () => {
    // Two copies: a module is loaded once per path, so a file rewritten in place isn't read again.
    const first = await copy0202();
    await using _ = first.copy;
    const second = await copy0202();
    await using __ = second.copy;
    const cloning = (commit: string) => `import { declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { repo: "https://github.com/acme/widgets.git", commit: "${commit}" },
  applyParameter: (config) => \`RUN git clone --quiet \${config.repo} /workspace \\\\
  && git -C /workspace checkout --quiet --detach \${config.commit}\`,
});
`;
    await Bun.write(`${first.parameters}/codeStates/baseline/index.ts`, cloning("24dc11c26e2716a12cf33b82fec895a7f02b3e8a"));
    await Bun.write(`${second.parameters}/codeStates/baseline/index.ts`, cloning("0123456789abcdef0123456789abcdef01234567"));
    const before = await hashPermutations(first.root, TWO_PAIRS);

    expect(changes(before, await hashPermutations(second.root, TWO_PAIRS))).toEqual(
      before.map(() => ({ parameters: ["codeState"], hash: true, image: true })),
    );
  });

  test("a base image's runOptions change its hash, but not the image", async () => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    await edit(`${parameters}/baseImages/node20/index.ts`, (text) => text.replace("applyParameter:", 'runOptions: ["--cap-add", "SYS_ADMIN"],\n  applyParameter:'));

    expect(changes(await hashPermutations(root, ONE), await hashPermutations(copied, ONE))).toEqual([
      { parameters: ["baseImage"], hash: true, image: false },
    ]);
  });

  test("a file beside a declaration, outside files/, changes no hash", async () => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    await Bun.write(`${parameters}/promptSets/snerk/AGENTS.md`, "# Snerk\n");
    await Bun.write(`${parameters}/harnessModels/fake-harness-alpha/helpers.ts`, "export const help = 1;\n");

    expect(await hashPermutations(copied, TWO_PAIRS)).toEqual(await hashPermutations(root, TWO_PAIRS));
  });

  test("changing a file in files/ changes only its parameter's hash, and the image's", async () => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    await Bun.write(`${parameters}/promptSets/snerk/files/AGENTS.md`, "# Snerk\n");
    const before = await hashPermutations(copied, TWO_PAIRS);
    await Bun.write(`${parameters}/promptSets/snerk/files/AGENTS.md`, "# Snerk, edited\n");

    changes(before, await hashPermutations(copied, TWO_PAIRS)).forEach((changed, i) => {
      expect(changed).toEqual(before[i]?.promptSet === "snerk" ? { parameters: ["promptSet"], hash: true, image: true } : UNCHANGED);
    });
  });

  describe("a symlink in a files/ folder", () => {
    const linkedCopy = async () => {
      const { copy, root: linkedRoot, parameters } = await copy0202();
      const files = `${parameters}/promptSets/snerk/files`;
      await Bun.write(`${copy.dir}/shared/AGENTS.md`, "# Shared\n");
      await Bun.write(`${copy.dir}/shared/skills/review/SKILL.md`, "# Review\n");
      await Bun.$`mkdir -p ${files}`.quiet();
      await Bun.$`ln -s ../../../../../shared/AGENTS.md ${files}/AGENTS.md`.quiet();
      await Bun.$`ln -s ../../../../../shared/skills ${files}/skills`.quiet();
      return { copy, root: linkedRoot, files };
    };

    test("is hashed by its target's content, under the link's path", async () => {
      const { copy, root: plainRoot, parameters } = await copy0202();
      await using _ = copy;
      await Bun.write(`${parameters}/promptSets/snerk/files/AGENTS.md`, "# Shared\n");
      await Bun.write(`${parameters}/promptSets/snerk/files/skills/review/SKILL.md`, "# Review\n");
      const linked = await linkedCopy();
      await using __ = linked.copy;

      expect(await hashes(linked.root, ONE)).toEqual(await hashes(plainRoot, ONE));
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
      const { copy, root: linkedRoot, files } = await linkedCopy();
      await using _ = copy;
      const before = await hashes(linkedRoot, ONE);
      await Bun.$`ln -s .. ${copy.dir}/shared/skills/review/up`.quiet();
      await Bun.$`ln -s . ${files}/self`.quiet();

      expect(await hashes(linkedRoot, ONE)).toEqual(before);
    });

    test("a dangling link is hashed by its path", async () => {
      const { copy, root: linkedRoot, files } = await linkedCopy();
      await using _ = copy;
      const before = await hashes(linkedRoot, ONE);
      await Bun.$`ln -s missing.md ${files}/GONE.md`.quiet();

      expect(await hashes(linkedRoot, ONE)).not.toEqual(before);
    });
  });

  test("the task's measurements are not part of any hash", async () => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    await Bun.write(`${parameters}/tasks/is-prime/measurements/extra.ts`, "export {};\n");

    expect(await hashes(copied, TWO_PAIRS)).toEqual(await hashes(root, TWO_PAIRS));
  });

  test("a fragment or cli that throws is a config error naming its file, once however many permutations use it", async () => {
    const { copy, root: copied, parameters } = await copy0202();
    await using _ = copy;
    await edit(`${parameters}/promptSets/snerk/index.ts`, (text) => text.replace("applyParameter: () =>", 'applyParameter: () => { throw new Error("no"); },\n  _was: () =>'));
    await edit(`${parameters}/harnessModels/fake-harness-beta/index.ts`, (text) => text.replace("cli: (ctx) =>", 'cli: () => { throw new Error("no cli"); },\n  _was: (ctx: { initialPrompt: string; modelId: string; resultPath: string }) =>'));

    await expect(hashPermutations(copied, TWO_PAIRS)).rejects.toThrow(
      [
        ".thunderjar/test-case-parameters/promptSets/snerk/index.ts: applyParameter: threw: no",
        ".thunderjar/test-case-parameters/harnessModels/fake-harness-beta/index.ts: cli: threw: no cli",
      ].join("\n"),
    );
  });
});

describe("hashPermutations, resolving", () => {
  const floating = `${scenario("0209")}/${FOLDER}`;
  const FOLLOW_MAIN: TestCaseDeclaration = { ...ONE, codeState: ["follow-main"] };
  const MAIN = "24dc11c26e2716a12cf33b82fec895a7f02b3e8a";
  const LATER = "0123456789abcdef0123456789abcdef01234567";

  /** A fake `ctx.exec` printing `stdout`, and the commands it was given. */
  const fakeExec = (stdout: (command: string) => string) => {
    const commands: string[] = [];
    return {
      commands,
      exec: async (command: string) => {
        commands.push(command);
        return stdout(command);
      },
    };
  };

  test("passes what resolve returns to the fragment as ctx.resolved, and records it", async () => {
    const { exec, commands } = fakeExec(() => `${MAIN}\trefs/heads/main`);

    const [permutation] = await hashPermutations(floating, FOLLOW_MAIN, { exec });

    expect(commands).toEqual(["git ls-remote --exit-code https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git refs/heads/main"]);
    expect(permutation?.dockerfile).toContain(`\n  && git -C /workspace checkout --quiet --detach ${MAIN} \\\n`);
    expect(permutation?.resolved).toEqual({ codeState: MAIN });
  });

  test("a different commit changes the code state's hash, and nothing else", async () => {
    const before = await hashPermutations(floating, FOLLOW_MAIN, fakeExec(() => MAIN));
    const after = await hashPermutations(floating, FOLLOW_MAIN, fakeExec(() => LATER));

    expect(changes(before, after)).toEqual([{ parameters: ["codeState"], hash: true, image: true }]);
  });

  test("the same commit gives the same hashes", async () => {
    expect(await hashPermutations(floating, FOLLOW_MAIN, fakeExec(() => MAIN))).toEqual(
      await hashPermutations(floating, FOLLOW_MAIN, fakeExec(() => MAIN)),
    );
  });

  test("a resolved value no fragment uses changes no hash", async () => {
    await using copy = await copyScenarioProject("0209");
    const root = `${copy.dir}/${FOLDER}`;
    await Bun.write(
      `${root}/test-case-parameters/promptSets/stamped/index.ts`,
      `import { declarePromptSet } from "thunderjar";

export default declarePromptSet({
  resolve: (_config, ctx) => ctx.exec("date"),
  applyParameter: () => "RUN echo stamped",
});
`,
    );
    const testCase = { ...ONE, promptSet: ["stamped"] };

    const monday = await hashPermutations(root, testCase, fakeExec(() => "Monday"));
    const tuesday = await hashPermutations(root, testCase, fakeExec(() => "Tuesday"));

    expect(monday[0]?.resolved).toEqual({ promptSet: "Monday" });
    expect(changes(monday, tuesday)).toEqual([UNCHANGED]);
  });

  test("a parameter that several permutations share is resolved once", async () => {
    const { exec, commands } = fakeExec(() => MAIN);

    const permutations = await hashPermutations(floating, { ...FOLLOW_MAIN, initialPrompt: ["plain", "plain"], iterations: 3 }, { exec });

    expect(permutations).toHaveLength(2);
    expect(permutations.map((permutation) => permutation.resolved)).toEqual([{ codeState: MAIN }, { codeState: MAIN }]);
    expect(commands).toHaveLength(1);
  });

  test("a resolve that throws, or a command that fails, is a config error naming its parameter", async () => {
    const failing = hostExec("/");
    const root = `${scenario("0402")}/${FOLDER}`;

    await expect(hashPermutations(floating, FOLLOW_MAIN, { exec: () => failing("echo 'no such remote' >&2; exit 2") })).rejects.toThrow(
      "code state \"follow-main\": resolve threw: `echo 'no such remote' >&2; exit 2` exited with 2: no such remote",
    );
    await expect(hashPermutations(root, { ...ONE, codeState: ["unresolvable"] })).rejects.toThrow(
      'code state "unresolvable": resolve threw: no branch named no-such-branch',
    );
  });

  test("a resolve that returns what JSON can't hold is a config error", async () => {
    await using copy = await copyScenarioProject("0209");
    const root = `${copy.dir}/${FOLDER}`;
    await Bun.write(
      `${root}/test-case-parameters/promptSets/vague/index.ts`,
      `import { declarePromptSet } from "thunderjar";

export default declarePromptSet({ resolve: () => undefined as never });
`,
    );

    await expect(hashPermutations(root, { ...ONE, promptSet: ["vague"] })).rejects.toThrow(
      'prompt set "vague": resolve must return a string, number, boolean or null, or a list or object of them, got undefined.',
    );
  });
});

describe("hostExec", () => {
  test("runs the command with sh in its folder, and gives its stdout, trimmed", async () => {
    expect(await hostExec(scenario("0209"))("pwd && printf '  a b  \\n\\n'")).toBe(`${scenario("0209")}\n  a b`);
  });

  test("throws on a non-zero exit, with its stderr", async () => {
    await expect(hostExec("/")("echo oops >&2; exit 3")).rejects.toThrow("`echo oops >&2; exit 3` exited with 3: oops");
  });
});
