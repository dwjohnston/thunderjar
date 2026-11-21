import { describe, expect, test } from "bun:test";
import { modelVariants } from "./harnessModels.ts";

describe("modelVariants", () => {
  test("a model without settings makes its ID alone", () => {
    expect(modelVariants("openai/gpt-5.5", [])).toEqual([{ name: "openai/gpt-5.5", modelId: "openai/gpt-5.5", model: {} }]);
  });

});
