import { describe, expect, test } from "bun:test";
import { modelVariants, splitPair } from "./harnessModels.ts";

describe("modelVariants", () => {
  test("a model without settings makes its ID alone", () => {
    expect(modelVariants("openai/gpt-5.5", [])).toEqual([{ name: "openai/gpt-5.5", modelId: "openai/gpt-5.5", model: {} }]);
  });

  test("fixed settings add no part; variant settings make their cross product, parts in array order", () => {
    const variants = modelVariants("m", [{ effort: { values: ["low", "high"] } }, { mode: "fast" }, { thinkingTokens: { values: [8000, 32000] } }]);

    expect(variants).toEqual([
      { name: "m/low/8000", modelId: "m", model: { effort: "low", mode: "fast", thinkingTokens: 8000 } },
      { name: "m/low/32000", modelId: "m", model: { effort: "low", mode: "fast", thinkingTokens: 32000 } },
      { name: "m/high/8000", modelId: "m", model: { effort: "high", mode: "fast", thinkingTokens: 8000 } },
      { name: "m/high/32000", modelId: "m", model: { effort: "high", mode: "fast", thinkingTokens: 32000 } },
    ]);
  });
});

describe("splitPair", () => {
  const models = {
    "openai/gpt-6.1": [],
    "openai/gpt-6.1/sol": [{ reasoningEffort: { values: ["low", "high"] } }],
  };

  test("takes the harness folder, then the longest declared model ID, then the variant parts", () => {
    expect(splitPair("codex-0.166.0/openai/gpt-6.1/sol/high", models)).toEqual({
      harness: "codex-0.166.0",
      modelId: "openai/gpt-6.1/sol",
      model: { reasoningEffort: "high" },
    });
  });

  test("names the declared models when it names none of them", () => {
    expect(splitPair("codex-0.166.0/openai/gpt-9", models)).toEqual({
      problem: '"codex-0.166.0/openai/gpt-9" is not a model of codex-0.166.0. Its models: openai/gpt-6.1, openai/gpt-6.1/sol',
    });
  });
});
