// Type tests of `applyParameter`'s arguments. Checked by `bun run typecheck`, not run for behaviour:
// every `@ts-expect-error` must be a real error, and every other line must compile.
import { test } from "bun:test";
import {
  declareBaseImage,
  declareCodeState,
  declareHarness,
  declareInitialPrompt,
  declareMeasurement,
  declarePromptSet,
} from "./declarations.ts";
import { writeModel, writeRunScript } from "./files.ts";

function assertType<T>(_value: T) {}

test("config is typed from the declaration's own config", () => {
  declareCodeState({
    config: { commit: "65bcb92cc069821e4695433b11582962ee6d68bd" },
    applyParameter: (config) => {
      assertType<string>(config.commit);
      // @ts-expect-error - not in this declaration's config
      return config.branch;
    },
  });
  declarePromptSet({
    config: { files: ["CLAUDE.md"] },
    applyParameter: (config) => config.files.map((file) => `COPY ${file} /workspace/`).join("\n"),
  });
  declareHarness({
    version: "2.1.283",
    config: { packageName: "@anthropic-ai/claude-code" },
    applyParameter: (config, ctx) => `RUN npm install -g ${config.packageName}@${ctx.version}\n${writeRunScript(`claude --model ${ctx.modelId}`)}`,
  });
});

test("config is undefined when the declaration has none", () => {
  declareBaseImage({
    applyParameter: (config) => {
      assertType<undefined>(config);
      return "FROM node:20-bookworm";
    },
  });
});

test("ctx carries dir for folder parameters, and version and modelId for harnesses", () => {
  declareCodeState({ applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/` });
  declareHarness({ version: "2.1.283", applyParameter: (_config, ctx) => `COPY ${ctx.dir}/install.sh /tmp/\nRUN /tmp/install.sh ${ctx.version}\n${writeModel(ctx.modelId)}` });
  // @ts-expect-error - only a harness gets a version
  declarePromptSet({ applyParameter: (_config, ctx) => ctx.version });
  // @ts-expect-error - an initial prompt is a file, not a folder: it has no dir
  declareInitialPrompt({ timeoutSeconds: 60, applyParameter: (_config, ctx) => ctx.dir });
  // @ts-expect-error - a harness must have a fragment: it writes the run script
  declareHarness({ version: "2.1.283" });
  // @ts-expect-error - an initial prompt writes its prompt with its fragment, not a field
  declareInitialPrompt({ prompt: "Go.", timeoutSeconds: 60 });
});

test("ctx.resolved is typed from what resolve returns, awaited", () => {
  declareCodeState({
    config: { repo: "https://github.com/acme/widgets.git", branch: "main" },
    resolve: (config, ctx) => {
      assertType<string>(config.branch);
      return ctx.exec(`git ls-remote --exit-code ${config.repo} refs/heads/${config.branch}`);
    },
    applyParameter: (_config, ctx) => {
      assertType<string>(ctx.resolved);
      assertType<string>(ctx.dir);
      return `RUN echo ${ctx.resolved.slice(0, 8)}`;
    },
  });
  declarePromptSet({
    resolve: () => ({ skills: ["review"], count: 1 }),
    applyParameter: (_config, ctx) => {
      assertType<string[]>(ctx.resolved.skills);
      // @ts-expect-error - not in what resolve returned
      return ctx.resolved.agents;
    },
  });
  declareHarness({
    version: "2.1.283",
    resolve: async () => "2.1.311",
    applyParameter: (_config, ctx) => {
      assertType<string>(ctx.resolved);
      return `RUN npm install -g @anthropic-ai/claude-code@${ctx.resolved}\n${writeRunScript(`claude --model ${ctx.modelId}`)}`;
    },
  });
});

test("ctx.resolved is undefined without a resolve, and resolve must return what JSON can hold", () => {
  declareCodeState({
    applyParameter: (_config, ctx) => {
      assertType<undefined>(ctx.resolved);
      return "";
    },
  });
  // @ts-expect-error - a function isn't something JSON can hold
  declareCodeState({ resolve: () => () => "main" });
  // @ts-expect-error - nor is a Date
  declareInitialPrompt({ timeoutSeconds: 60, resolve: () => new Date() });
});

test("a base image must say how it is applied: it carries the FROM", () => {
  // @ts-expect-error - applyParameter is missing
  declareBaseImage({});
  declareCodeState({});
});

test("a measurement's config and aggregate are typed by its instrument", () => {
  declareMeasurement({ instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, aggregate: ["rate", "count"] });
  declareMeasurement({ instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" }, aggregate: ["mean", "max"] });
  declareMeasurement({
    instrument: "templateTest",
    config: { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" },
    aggregate: ["sum", "mean"],
  });
  declareMeasurement({ instrument: "shell", config: { command: "bunx tsc --noEmit" }, aggregate: ["rate"] });
  // @ts-expect-error - not an instrument
  declareMeasurement({ instrument: "fileCraeted", config: { glob: "**/isPrime.ts" }, aggregate: ["rate"] });
  // @ts-expect-error - fileCreated's config is a glob
  declareMeasurement({ instrument: "fileCreated", config: { path: "isPrime.ts" }, aggregate: ["rate"] });
  // @ts-expect-error - grep needs a pattern
  declareMeasurement({ instrument: "grep", config: { glob: "**/*.ts" }, aggregate: ["max"] });
  // @ts-expect-error - a boolean has no mean
  declareMeasurement({ instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, aggregate: ["mean"] });
  // @ts-expect-error - a count has no rate
  declareMeasurement({ instrument: "grep", config: { glob: "**/*.ts", pattern: "x" }, aggregate: ["rate"] });
  // @ts-expect-error - shell needs a command
  declareMeasurement({ instrument: "shell", config: { cmd: "true" }, aggregate: ["rate"] });
  // @ts-expect-error - a shell command's pass or fail has no sum
  declareMeasurement({ instrument: "shell", config: { command: "true" }, aggregate: ["sum"] });
  // @ts-expect-error - pass and fail counts have no median
  declareMeasurement({ instrument: "templateTest", config: { subject: "*.ts", template: "./t.ts" }, aggregate: ["median"] });
});
