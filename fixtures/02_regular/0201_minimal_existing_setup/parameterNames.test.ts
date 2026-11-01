// Type tests of the names `thunderjar generate` wrote to project/.thunderjar/_generated/.
// Checked by src/testing/scenarios.typecheck.test.ts, not run for behaviour: every
// `@ts-expect-error` must be a real error, and every other line must compile.
import { describe, it } from "bun:test";
import { declareTestCase } from "thunderjar";

function assertType<T>(_value: T) {}

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
    assertType<HarnessModelName>("fake-harness-alpha@1.0.0/fake-model-small");
    // @ts-expect-error - not a declared version
    assertType<HarnessModelName>("fake-harness-alpha@9.9.9/fake-model-small");
    // @ts-expect-error - not a declared model
    assertType<HarnessModelName>("fake-harness-alpha@1.0.0/fake-model-large");
    // @ts-expect-error - not a declared harness
    assertType<HarnessModelName>("claude-code@1.0.0/fake-model-small");
  });
});

describe("declareTestCase", () => {
  it("accepts declared names", () => {
    declareTestCase({
      baseImage: ["node20"],
      codeState: ["baseline"],
      promptSet: ["snerk"],
      harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
      task: "is-prime",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });

  it("rejects an undeclared base image", () => {
    declareTestCase({
      // @ts-expect-error - "node22" is not a declared base image
      baseImage: ["node22"],
      codeState: ["baseline"],
      promptSet: ["snerk"],
      harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
      task: "is-prime",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });

  it("rejects an undeclared code state", () => {
    declareTestCase({
      baseImage: ["node20"],
      // @ts-expect-error - "baselinee" is not a declared code state
      codeState: ["baselinee"],
      promptSet: ["snerk"],
      harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
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
      harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
      task: "is-prime",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });

  it("rejects an undeclared harness/model pair", () => {
    declareTestCase({
      baseImage: ["node20"],
      codeState: ["baseline"],
      promptSet: ["snerk"],
      // @ts-expect-error - "fake-model-large" is not a declared model
      harnessModel: ["fake-harness-alpha@1.0.0/fake-model-large"],
      task: "is-prime",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });

  it("rejects an undeclared task", () => {
    declareTestCase({
      baseImage: ["node20"],
      codeState: ["baseline"],
      promptSet: ["snerk"],
      harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
      // @ts-expect-error - "is-even" is not a declared task
      task: "is-even",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });

  it("rejects an initial prompt the task doesn't have", () => {
    declareTestCase({
      baseImage: ["node20"],
      codeState: ["baseline"],
      promptSet: ["snerk"],
      harnessModel: ["fake-harness-alpha@1.0.0/fake-model-small"],
      task: "is-prime",
      // @ts-expect-error - "terse" is not an initial prompt of is-prime
      initialPrompt: ["terse"],
      iterations: 1,
    });
  });
});
