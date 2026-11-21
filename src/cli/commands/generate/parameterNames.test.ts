import { describe, expect, test } from "bun:test";
import { renderParameterNames } from "./parameterNames.ts";

const declarations = (text: string) => text.slice(text.indexOf("type BaseImageName"), text.indexOf("\ninterface"));

describe("renderParameterNames", () => {
  test("a kind with no names is never, and an empty task list is {}", () => {
    const text = renderParameterNames({ baseImages: [], codeStates: [], promptSets: [], tasks: {}, harnesses: [] });

    expect(declarations(text)).toBe(`type BaseImageName = never;
type CodeStateName = never;
type PromptSetName = never;
type TaskName = never;
type InitialPromptNames = {};
type HarnessName = never;
type HarnessModelName = \`\${HarnessName}/\${string}\`;
`);
  });

  test("each task gets its own initial prompts, and a pair is any harness folder, then any model ID", () => {
    const text = renderParameterNames({
      baseImages: ["node20", "node22"],
      codeStates: ["baseline"],
      promptSets: ["glurk", "snerk"],
      tasks: { "fizz-buzz": ["fizzy"], "is-prime": ["plain", "terse"], "no-prompts": [] },
      harnesses: ["claude-code-2.1.311", "fake-harness-alpha"],
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
type HarnessName = "claude-code-2.1.311" | "fake-harness-alpha";
type HarnessModelName = \`\${HarnessName}/\${string}\`;
`);
  });
});
