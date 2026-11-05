import { describe, expect, test } from "bun:test";
import { renderParameterNames } from "./parameterNames.ts";

const declarations = (text: string) => text.slice(text.indexOf("type BaseImageName"), text.indexOf("\ninterface"));

describe("renderParameterNames", () => {
  test("a kind with no names is never, and an empty task list is {}", () => {
    const text = renderParameterNames({ baseImages: [], codeStates: [], promptSets: [], tasks: {}, harnesses: {} });

    expect(declarations(text)).toBe(`type BaseImageName = never;
type CodeStateName = never;
type PromptSetName = never;
type TaskName = never;
type InitialPromptNames = {};
type HarnessModelName = never;
`);
  });

  test("each task gets its own initial prompts, and each harness its own versions and models", () => {
    const text = renderParameterNames({
      baseImages: ["node20", "node22"],
      codeStates: ["baseline"],
      promptSets: ["glurk", "snerk"],
      tasks: { "fizz-buzz": ["fizzy"], "is-prime": ["plain", "terse"], "no-prompts": [] },
      harnesses: {
        "fake-harness-alpha": { versions: ["1.0.0"], models: ["fake-model-small"] },
        "fake-harness-beta": { versions: ["1.0.0", "2.0.0"], models: ["fake-model-large", "fake-model-small"] },
        "no-models": { versions: ["1.0.0"], models: [] },
      },
    });

    expect(declarations(text)).toBe(`type BaseImageName = "node20" | "node22";
type CodeStateName = "baseline";
type PromptSetName = "glurk" | "snerk";
type TaskName = "fizz-buzz" | "is-prime" | "no-prompts";
type InitialPromptNames = {
  "fizz-buzz": "fizzy";
  "is-prime": "plain" | "terse";
  "no-prompts": never;
};
type HarnessModelName =
  | \`fake-harness-alpha@\${"1.0.0"}/\${"fake-model-small"}\`
  | \`fake-harness-beta@\${"1.0.0" | "2.0.0"}/\${"fake-model-large" | "fake-model-small"}\`;
`);
  });
});
