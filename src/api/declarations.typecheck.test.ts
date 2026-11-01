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
    config: { packageName: "@anthropic-ai/claude-code" },
    applyParameter: (config, ctx) => `RUN npm install -g ${config.packageName}@${ctx.version}`,
    cli: (ctx) => `claude -p "${ctx.initialPrompt}"`,
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

test("ctx carries dir for folder parameters, and version for harnesses", () => {
  declareCodeState({ applyParameter: (_config, ctx) => `COPY ${ctx.dir}/files/ /workspace/` });
  declareHarness({ applyParameter: (_config, ctx) => `COPY ${ctx.dir}/install.sh /tmp/\nRUN /tmp/install.sh ${ctx.version}`, cli: () => "" });
  // @ts-expect-error - only a harness gets a version
  declarePromptSet({ applyParameter: (_config, ctx) => ctx.version });
  // @ts-expect-error - an initial prompt is a file, not a folder: it has no dir
  declareInitialPrompt({ prompt: "Go.", timeoutSeconds: 60, applyParameter: (_config, ctx) => ctx.dir });
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
  // @ts-expect-error - pass and fail counts have no median
  declareMeasurement({ instrument: "templateTest", config: { subject: "*.ts", template: "./t.ts" }, aggregate: ["median"] });
});
