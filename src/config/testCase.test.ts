import { describe, expect, test } from "bun:test";
import { scenario } from "../testing/scenario.ts";
import { ConfigError } from "./loader.ts";
import { loadTestCase } from "./testCase.ts";

describe("loadTestCase", () => {
  const root = `${scenario("0201")}/.thunderjar`;

  test("loads the default export of test-cases/<name>.ts", async () => {
    expect(await loadTestCase(root, "example")).toEqual({
      baseImage: ["node20"],
      codeState: ["baseline"],
      promptSet: ["snerk"],
      harnessModel: ["fake-harness-alpha/fake-model-small-001"],
      task: "is-prime",
      initialPrompt: ["plain"],
      iterations: 1,
    });
  });

  test("fails for a test case with no file", async () => {
    await expect(loadTestCase(root, "missing")).rejects.toThrow(
      new ConfigError('No test case named "missing": expected .thunderjar/test-cases/missing.ts.'),
    );
  });
});
