import { describe, expect, test } from "bun:test";
import { CHECKOUT_COMMIT, checkoutCommit } from "../api/checkoutCommit.ts";
import {
  type ApplyParameterCtx,
  declareBaseImage,
  declareCodeState,
  declareHarness,
  declareInitialPrompt,
  declarePromptSet,
} from "../api/declarations.ts";
import { ConfigError, FOLDER } from "../config/loader.ts";
import { loadTestCase } from "../config/testCase.ts";
import { expandPermutations } from "../config/permutations.ts";
import { scenario } from "../testing/scenario.ts";
import { loadPrerunParameters, PARAMETER_DIRS, type PrerunParameters, renderPrerun } from "./prerunDockerfile.ts";

const parameters = (overrides: Partial<PrerunParameters> = {}): PrerunParameters => ({
  baseImage: { file: "baseImages/node20/index.ts", declaration: declareBaseImage({ applyParameter: () => "FROM node:20-bookworm" }) },
  codeState: { file: "codeStates/baseline/index.ts", declaration: declareCodeState({ applyParameter: () => "RUN npm ci" }) },
  promptSet: { file: "promptSets/snerk/index.ts", declaration: declarePromptSet({ applyParameter: () => "COPY CLAUDE.md /workspace/" }) },
  harness: {
    file: "harnessModels/claude-code/index.ts",
    declaration: declareHarness({ applyParameter: () => "RUN npm install -g claude", cli: () => "claude" }),
    version: "2.1.283",
  },
  initialPrompt: { file: "tasks/is-prime/initial-prompts/plain.ts", declaration: declareInitialPrompt({ prompt: "Go.", timeoutSeconds: 60 }) },
  ...overrides,
});

const problemsOf = (render: () => unknown): string[] => {
  try {
    render();
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("expected a ConfigError");
};

describe("renderPrerun", () => {
  test("folds the fragments in build order: base image, WORKDIR, code state, prompt set, harness, initial prompt", () => {
    const initialPrompt = {
      file: "tasks/is-prime/initial-prompts/plain.ts",
      declaration: declareInitialPrompt({ prompt: "Go.", timeoutSeconds: 60, applyParameter: () => "RUN touch /workspace/PROMPT" }),
    };
    expect(renderPrerun(parameters({ initialPrompt })).dockerfile).toBe(
      [
        "FROM node:20-bookworm",
        "WORKDIR /workspace",
        "RUN npm ci",
        "COPY CLAUDE.md /workspace/",
        "RUN npm install -g claude",
        "RUN touch /workspace/PROMPT",
        "",
      ].join("\n"),
    );
  });

  test("a missing or empty fragment adds no line, and surrounding whitespace is trimmed", () => {
    const { dockerfile } = renderPrerun(
      parameters({
        codeState: { file: "codeStates/baseline/index.ts", declaration: declareCodeState({}) },
        promptSet: { file: "promptSets/snerk/index.ts", declaration: declarePromptSet({ applyParameter: () => "  \n" }) },
        baseImage: { file: "baseImages/node20/index.ts", declaration: declareBaseImage({ applyParameter: () => "\nFROM node:20\nRUN apt-get update\n" }) },
      }),
    );
    expect(dockerfile).toBe("FROM node:20\nRUN apt-get update\nWORKDIR /workspace\nRUN npm install -g claude\n");
  });

  test("each fragment gets its declaration's config, and a ctx with its role's dir", () => {
    const seen: Record<string, unknown> = {};
    const { dockerfile } = renderPrerun(
      parameters({
        baseImage: {
          file: "baseImages/node20/index.ts",
          declaration: declareBaseImage({ config: { tag: "20-bookworm" }, applyParameter: (config, ctx) => ((seen.baseImage = ctx), `FROM node:${config.tag}`) }),
        },
        codeState: {
          file: "codeStates/baseline/index.ts",
          declaration: declareCodeState({
            config: { install: "npm ci" },
            applyParameter: (config, ctx) => ((seen.codeState = ctx), `COPY ${ctx.dir}/files/ /workspace/\nRUN ${config.install}`),
          }),
        },
        promptSet: {
          file: "promptSets/snerk/index.ts",
          declaration: declarePromptSet({ applyParameter: (config, ctx) => ((seen.promptSet = [config, ctx]), "") }),
        },
        harness: {
          file: "harnessModels/claude-code/index.ts",
          declaration: declareHarness({
            config: { packageName: "@anthropic-ai/claude-code" },
            applyParameter: (config, ctx) => ((seen.harness = ctx), `RUN npm install -g ${config.packageName}@${ctx.version}`),
            cli: () => "claude",
          }),
          version: "2.1.283",
        },
        initialPrompt: {
          file: "tasks/is-prime/initial-prompts/plain.ts",
          declaration: declareInitialPrompt({ prompt: "Go.", timeoutSeconds: 60, applyParameter: (_config, ctx) => ((seen.initialPrompt = ctx), "") }),
        },
      }),
    );

    expect(dockerfile).toBe(
      [
        "FROM node:20-bookworm",
        "WORKDIR /workspace",
        "COPY parameters/codeState/files/ /workspace/",
        "RUN npm ci",
        "RUN npm install -g @anthropic-ai/claude-code@2.1.283",
        "",
      ].join("\n"),
    );
    const git = { show: expect.any(Function) };
    expect(seen).toEqual({
      baseImage: { dir: PARAMETER_DIRS.baseImage, git },
      codeState: { dir: "parameters/codeState", git, [CHECKOUT_COMMIT]: expect.any(Function) },
      promptSet: [undefined, { dir: "parameters/promptSet", git }],
      harness: { dir: "parameters/harness", git, version: "2.1.283" },
      initialPrompt: { git },
    });
  });

  test("a base image must have a fragment, and it must start with FROM", () => {
    const missing = { file: "test-case-parameters/baseImages/node20/index.ts", declaration: {} as ReturnType<typeof declareBaseImage> };
    expect(problemsOf(() => renderPrerun(parameters({ baseImage: missing })))).toEqual([
      ".thunderjar/test-case-parameters/baseImages/node20/index.ts: applyParameter: is missing. A base image's fragment provides the FROM.",
    ]);

    const noFrom = { file: "test-case-parameters/baseImages/node20/index.ts", declaration: declareBaseImage({ applyParameter: () => "RUN echo hi\nFROM node:20" }) };
    expect(problemsOf(() => renderPrerun(parameters({ baseImage: noFrom })))).toEqual([
      '.thunderjar/test-case-parameters/baseImages/node20/index.ts: applyParameter: must return a fragment that starts with FROM, got "RUN echo hi".',
    ]);

    const empty = { file: "test-case-parameters/baseImages/node20/index.ts", declaration: declareBaseImage({ applyParameter: () => "" }) };
    expect(problemsOf(() => renderPrerun(parameters({ baseImage: empty })))).toEqual([
      '.thunderjar/test-case-parameters/baseImages/node20/index.ts: applyParameter: must return a fragment that starts with FROM, got "".',
    ]);
  });

  test("names every fragment that throws or doesn't return a string, all at once", () => {
    const codeState = {
      file: "test-case-parameters/codeStates/baseline/index.ts",
      declaration: declareCodeState({
        applyParameter: () => {
          throw new Error("no commit configured");
        },
      }),
    };
    const promptSet = {
      file: "test-case-parameters/promptSets/snerk/index.ts",
      declaration: { applyParameter: () => undefined } as unknown as ReturnType<typeof declarePromptSet>,
    };
    expect(problemsOf(() => renderPrerun(parameters({ codeState, promptSet })))).toEqual([
      ".thunderjar/test-case-parameters/codeStates/baseline/index.ts: applyParameter: threw: no commit configured",
      ".thunderjar/test-case-parameters/promptSets/snerk/index.ts: applyParameter: must return a Dockerfile fragment, a string, got undefined.",
    ]);
  });
});

describe("renderPrerun, reading the repository", () => {
  const COMMIT = "65bcb92cc069821e4695433b11582962ee6d68bd";
  const codeState = (applyParameter: (config: unknown, ctx: ApplyParameterCtx) => string) => ({
    file: "test-case-parameters/codeStates/baseline/index.ts",
    declaration: declareCodeState({ applyParameter }),
  });
  const promptSet = (applyParameter: (config: unknown, ctx: ApplyParameterCtx) => string) => ({
    file: "test-case-parameters/promptSets/snerk/index.ts",
    declaration: declarePromptSet({ applyParameter }),
  });

  test("checkoutCommit: Thunderjar clones the bundle straight after the base image, then WORKDIR, then the code state's own lines", () => {
    const { dockerfile, git } = renderPrerun(
      parameters({ codeState: codeState((_config, ctx) => `${checkoutCommit(ctx, COMMIT)}\nRUN npm ci`) }),
    );

    expect(dockerfile).toBe(`FROM node:20-bookworm
COPY code.bundle /tmp/code.bundle
RUN git clone --quiet /tmp/code.bundle /workspace \\
  && git -C /workspace checkout --quiet --detach ${COMMIT} \\
  && git -C /workspace branch --quiet --delete --force code-state \\
  && git -C /workspace remote remove origin \\
  && git -C /workspace config user.name "Thunderjar agent" \\
  && git -C /workspace config user.email agent@thunderjar.invalid \\
  && rm /tmp/code.bundle
WORKDIR /workspace
RUN npm ci
COPY CLAUDE.md /workspace/
RUN npm install -g claude
`);
    expect(git).toEqual([{ kind: "bundle", owner: 'code state "baseline"', commit: COMMIT, path: "code.bundle" }]);
  });

  test("ctx.git.show: the file's path in the build context, recorded with its commit", () => {
    const { dockerfile, git } = renderPrerun(
      parameters({
        promptSet: promptSet((_config, ctx) => `COPY ${ctx.git.show("e4f5a6", "./prompts//snerk.md")} /workspace/CLAUDE.md`),
      }),
    );

    expect(dockerfile).toContain("\nCOPY git/e4f5a6/prompts/snerk.md /workspace/CLAUDE.md\n");
    expect(git).toEqual([
      { kind: "file", owner: 'prompt set "snerk"', commit: "e4f5a6", file: "prompts/snerk.md", path: "git/e4f5a6/prompts/snerk.md" },
    ]);
  });

  test("a fragment that reads nothing from the repository needs nothing from it", () => {
    expect(renderPrerun(parameters()).git).toEqual([]);
  });

  test("a commit that isn't a hash, a path outside the repository, and checkoutCommit outside a code state are errors", () => {
    expect(
      problemsOf(() =>
        renderPrerun(
          parameters({
            codeState: codeState((_config, ctx) => checkoutCommit(ctx, "main")),
            promptSet: promptSet((_config, ctx) => `COPY ${ctx.git.show(COMMIT, "../secrets.md")} /workspace/`),
            harness: {
              file: "test-case-parameters/harnessModels/claude-code/index.ts",
              declaration: declareHarness({ applyParameter: (_config, ctx) => checkoutCommit(ctx, COMMIT), cli: () => "claude" }),
              version: "2.1.283",
            },
          }),
        ),
      ),
    ).toEqual([
      '.thunderjar/test-case-parameters/codeStates/baseline/index.ts: applyParameter: threw: checkoutCommit needs a commit hash, got "main".',
      '.thunderjar/test-case-parameters/promptSets/snerk/index.ts: applyParameter: threw: ctx.git.show needs a path inside the repository, got "../secrets.md".',
      ".thunderjar/test-case-parameters/harnessModels/claude-code/index.ts: applyParameter: threw: checkoutCommit is only for a code state's applyParameter.",
    ]);
  });

  test("a code state checks out one commit", () => {
    expect(
      problemsOf(() => renderPrerun(parameters({ codeState: codeState((_config, ctx) => checkoutCommit(ctx, "a1b2c3") + checkoutCommit(ctx, "d4e5f6")) }))),
    ).toEqual([
      ".thunderjar/test-case-parameters/codeStates/baseline/index.ts: applyParameter: threw: checkoutCommit was already called, with a1b2c3: a code state checks out one commit.",
    ]);
  });
});

describe("loadPrerunParameters", () => {
  test("renders each permutation of a scenario from its own declarations", async () => {
    const root = `${scenario("0202")}/${FOLDER}`;
    const testCase = await loadTestCase(root, "is-prime-baseline");
    const dockerfiles = await Promise.all(
      expandPermutations(testCase).map(async (permutation) =>
        renderPrerun(await loadPrerunParameters(root, testCase.task, permutation)).dockerfile,
      ),
    );

    expect(dockerfiles[0]).toBe(
      [
        "FROM node:20-bookworm",
        "WORKDIR /workspace",
        'RUN echo "Write small functions, and say what each one is for." > /workspace/FAKE_INSTRUCTIONS.md',
        'RUN echo "install fake-harness-alpha@1.0.0"',
        "",
      ].join("\n"),
    );
    expect(new Set(dockerfiles)).toEqual(
      new Set(
        ["Write small functions, and say what each one is for.", "Prefer one clear expression to a loop."].flatMap((instructions) =>
          ["alpha", "beta"].map((harness) =>
            [
              "FROM node:20-bookworm",
              "WORKDIR /workspace",
              `RUN echo "${instructions}" > /workspace/FAKE_INSTRUCTIONS.md`,
              `RUN echo "install fake-harness-${harness}@1.0.0"`,
              "",
            ].join("\n"),
          ),
        ),
      ),
    );
  });
});
