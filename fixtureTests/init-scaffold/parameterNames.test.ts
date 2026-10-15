// Type-level assertions against fixtures/.thunderjar, the project `init` scaffolds.
// Checked by fixtureTests/typecheck.test.ts, not by running: every `@ts-expect-error`
// must be a real error, and every other line must compile.

import { describe, it } from "bun:test";
// Relative, not "thunderjar": bun also runs this file, possibly before the harness links it.
import { declareTestCase } from "../../src/index.ts";

function assertType<T>(_value: T) { }

describe("generated parameter names", () => {
  it("BaseImageName", () => {
    assertType<BaseImageName>("node20");
    // @ts-expect-error - not a declared base image
    assertType<BaseImageName>("node22");
  });

  it("CodeStateName", () => {
    assertType<CodeStateName>("baseline");
    // @ts-expect-error - not a declared code state
    assertType<CodeStateName>("baselinee");
  });

  it("PromptSetName", () => {
    assertType<PromptSetName>("snerk");
    // @ts-expect-error - not a declared prompt set
    assertType<PromptSetName>("snerkaa");
  });

  it("TaskName", () => {
    assertType<TaskName>("is-prime");
    // @ts-expect-error - not a declared task
    assertType<TaskName>("is-even");
  });

  it("InitialPromptNames", () => {
    assertType<InitialPromptNames["is-prime"]>("plain");
    // @ts-expect-error - not an initial prompt of is-prime
    assertType<InitialPromptNames["is-prime"]>("terse");
  });

  it("HarnessModelName", () => {
    assertType<HarnessModelName>("claude-code@2.1.283/haiku-4-5");
    // @ts-expect-error - not a declared version
    assertType<HarnessModelName>("claude-code@9.9.9/haiku-4-5");
    // @ts-expect-error - not a declared model
    assertType<HarnessModelName>("claude-code@2.1.283/opus");
  });
});

describe("declareTestCase", () => {
  it("accepts declared names", () => {
    declareTestCase({
      baseImage: ["node20"],
      codeState: ["baseline"],
      promptSet: ["snerk"],
      harnessModel: ["claude-code@2.1.283/haiku-4-5"],
      task: "is-prime",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });

  it("rejects an undeclared prompt set", () => {
    declareTestCase({
      baseImage: ["node20"],
      codeState: ["baseline"],
      // @ts-expect-error - "snerkaa" is not a declared prompt set
      promptSet: ["snerkaa"],
      harnessModel: ["claude-code@2.1.283/haiku-4-5"],
      task: "is-prime",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });
});
