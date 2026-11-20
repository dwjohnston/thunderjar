import { describe, expect, test } from "bun:test";
import {
  declareBaseImage,
  declareCodeState,
  declareHarness,
  declareInitialPrompt,
  declarePromptSet,
} from "../api/declarations.ts";
import { ConfigError } from "../config/loader.ts";
import { PARAMETER_DIRS, type PrerunParameters, renderPrerun } from "./prerunDockerfile.ts";

const parameters = (overrides: Partial<PrerunParameters> = {}): PrerunParameters => ({
  baseImage: { file: "baseImages/node20/index.ts", declaration: declareBaseImage({ applyParameter: () => "FROM node:20-bookworm" }) },
  codeState: { file: "codeStates/baseline/index.ts", declaration: declareCodeState({ applyParameter: () => "RUN npm ci" }) },
  promptSet: { file: "promptSets/snerk/index.ts", declaration: declarePromptSet({ applyParameter: () => "COPY CLAUDE.md /workspace/" }) },
  harness: {
    file: "harnessModels/claude-code/index.ts",
    declaration: declareHarness({ version: "2.1.283", applyParameter: () => "RUN npm install -g claude" }),
  },
  initialPrompt: { file: "tasks/is-prime/initial-prompts/plain.ts", declaration: declareInitialPrompt({ timeoutSeconds: 60 }) },
  modelId: "claude-haiku-5-5",
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
      declaration: declareInitialPrompt({ timeoutSeconds: 60, applyParameter: () => "RUN touch /workspace/PROMPT" }),
    };
    expect(renderPrerun(parameters({ initialPrompt }))).toBe(
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
    const dockerfile = renderPrerun(
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
    const dockerfile = renderPrerun(
      parameters({
        baseImage: {
          file: "baseImages/node20/index.ts",
          declaration: declareBaseImage({ config: { tag: "20-bookworm" }, applyParameter: (config, ctx) => ((seen.baseImage = ctx), `FROM node:${config.tag}`) }),
        },
        codeState: {
          file: "codeStates/baseline/index.ts",
          declaration: declareCodeState({
            config: { install: "npm ci" },
            applyParameter: (config, ctx) => ((seen.codeState = ctx), `COPY ${ctx.dir}/ /workspace/\nRUN ${config.install}`),
          }),
        },
        promptSet: {
          file: "promptSets/snerk/index.ts",
          declaration: declarePromptSet({ applyParameter: (config, ctx) => ((seen.promptSet = [config, ctx]), "") }),
        },
        harness: {
          file: "harnessModels/claude-code/index.ts",
          declaration: declareHarness({
            version: "2.1.283",
            config: { packageName: "@anthropic-ai/claude-code" },
            applyParameter: (config, ctx) => ((seen.harness = ctx), `RUN npm install -g ${config.packageName}@${ctx.version}`),
          }),
        },
        initialPrompt: {
          file: "tasks/is-prime/initial-prompts/plain.ts",
          declaration: declareInitialPrompt({ timeoutSeconds: 60, applyParameter: (_config, ctx) => ((seen.initialPrompt = ctx), "") }),
        },
      }),
    );

    expect(dockerfile).toBe(
      [
        "FROM node:20-bookworm",
        "WORKDIR /workspace",
        "COPY parameters/codeState/ /workspace/",
        "RUN npm ci",
        "RUN npm install -g @anthropic-ai/claude-code@2.1.283",
        "",
      ].join("\n"),
    );
    expect(seen).toEqual({
      baseImage: { dir: PARAMETER_DIRS.baseImage },
      codeState: { dir: "parameters/codeState" },
      promptSet: [undefined, { dir: "parameters/promptSet" }],
      harness: { dir: "parameters/harness", version: "2.1.283", modelId: "claude-haiku-5-5" },
      initialPrompt: {},
    });
  });

  test("a base image must have a fragment, and it must start with FROM", () => {
    const missing = { file: "parameters/baseImages/node20/index.ts", declaration: {} as ReturnType<typeof declareBaseImage> };
    expect(problemsOf(() => renderPrerun(parameters({ baseImage: missing })))).toEqual([
      ".thunderjar/parameters/baseImages/node20/index.ts: applyParameter: is missing. A base image's fragment provides the FROM.",
    ]);

    const noFrom = { file: "parameters/baseImages/node20/index.ts", declaration: declareBaseImage({ applyParameter: () => "RUN echo hi\nFROM node:20" }) };
    expect(problemsOf(() => renderPrerun(parameters({ baseImage: noFrom })))).toEqual([
      '.thunderjar/parameters/baseImages/node20/index.ts: applyParameter: must return a fragment that starts with FROM, got "RUN echo hi".',
    ]);

    const empty = { file: "parameters/baseImages/node20/index.ts", declaration: declareBaseImage({ applyParameter: () => "" }) };
    expect(problemsOf(() => renderPrerun(parameters({ baseImage: empty })))).toEqual([
      '.thunderjar/parameters/baseImages/node20/index.ts: applyParameter: must return a fragment that starts with FROM, got "".',
    ]);
  });

  test("names every fragment that throws or doesn't return a string, all at once", () => {
    const codeState = {
      file: "parameters/codeStates/baseline/index.ts",
      declaration: declareCodeState({
        applyParameter: () => {
          throw new Error("no commit configured");
        },
      }),
    };
    const promptSet = {
      file: "parameters/promptSets/snerk/index.ts",
      declaration: { applyParameter: () => undefined } as unknown as ReturnType<typeof declarePromptSet>,
    };
    expect(problemsOf(() => renderPrerun(parameters({ codeState, promptSet })))).toEqual([
      ".thunderjar/parameters/codeStates/baseline/index.ts: applyParameter: threw: no commit configured",
      ".thunderjar/parameters/promptSets/snerk/index.ts: applyParameter: must return a Dockerfile fragment, a string, got undefined.",
    ]);
  });
});

describe("renderPrerun, the build context", () => {
  test("a fragment may name its own folder, and paths that only look like another's", () => {
    const harness = {
      file: "parameters/harnessModels/claude-code/index.ts",
      declaration: declareHarness({
        version: "2.1.283",
        applyParameter: (_config, ctx) => `COPY ${ctx.dir}/scripts/ /opt/parameters/promptSet/\nRUN ls parameters/harnessy`,
      }),
    };

    expect(renderPrerun(parameters({ harness }))).toContain("\nCOPY parameters/harness/scripts/ /opt/parameters/promptSet/\n");
  });

  test("a fragment naming another parameter's folder is an error naming its file, the initial prompt's included", () => {
    const codeState = {
      file: "parameters/codeStates/baseline/index.ts",
      declaration: declareCodeState({ applyParameter: () => "COPY parameters/baseImage/ /workspace/\nCOPY ./parameters/promptSet/AGENTS.md /workspace/" }),
    };
    const initialPrompt = {
      file: "parameters/tasks/is-prime/initial-prompts/plain.ts",
      declaration: declareInitialPrompt({ timeoutSeconds: 60, applyParameter: () => "COPY parameters/harness/PROMPT.md /workspace/" }),
    };

    expect(problemsOf(() => renderPrerun(parameters({ codeState, initialPrompt })))).toEqual([
      ".thunderjar/parameters/codeStates/baseline/index.ts: applyParameter: uses another parameter's folder in the build context: the base image's, parameters/baseImage, and the prompt set's, parameters/promptSet. A fragment can only use its own files/, through ctx.dir.",
      ".thunderjar/parameters/tasks/is-prime/initial-prompts/plain.ts: applyParameter: uses another parameter's folder in the build context: the harness's, parameters/harness. A fragment can only use its own files/, through ctx.dir.",
    ]);
  });
});

describe("renderPrerun, a code state that clones a repository", () => {
  test("its RUN follows WORKDIR, its line continuations intact", () => {
    const codeState = {
      file: "parameters/codeStates/baseline/index.ts",
      declaration: declareCodeState({
        config: { repo: "https://github.com/acme/widgets.git", commit: "24dc11c26e2716a12cf33b82fec895a7f02b3e8a" },
        applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin`,
      }),
    };

    expect(renderPrerun(parameters({ codeState }))).toBe(`FROM node:20-bookworm
WORKDIR /workspace
RUN git clone --quiet https://github.com/acme/widgets.git /workspace \\
  && git -C /workspace checkout --quiet --detach 24dc11c26e2716a12cf33b82fec895a7f02b3e8a \\
  && git -C /workspace remote remove origin
COPY CLAUDE.md /workspace/
RUN npm install -g claude
`);
  });
});
