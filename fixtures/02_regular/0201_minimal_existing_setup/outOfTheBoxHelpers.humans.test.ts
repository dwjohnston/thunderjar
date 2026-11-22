// Type tests of the names the out-of-the-box harness helpers give, as `thunderjar generate` wrote
// them to project/.thunderjar/_generated/. Checked by src/testing/scenarios.typecheck.test.ts, not
// run for behaviour: every `@ts-expect-error` must be a real error, and every other line must compile.
import { describe, it } from "bun:test";

function assertType<T>(_value: T) {}

describe("claudeCode(), with its built-in models", () => {
  it("names any of Anthropic's current models", () => {
    assertType<HarnessModelName>("claude-code-2.1.311/claude-fable-5-2");
    assertType<HarnessModelName>("claude-code-2.1.311/claude-opus-5-5");
    assertType<HarnessModelName>("claude-code-2.1.311/claude-sonnet-5-5");
    assertType<HarnessModelName>("claude-code-2.1.311/claude-haiku-5-5");
    assertType<HarnessModelName>("claude-code-2.1.311/claude-haiku-4-5-20251001");
  });

  it("names no other model", () => {
    // @ts-expect-error - not one of its models
    assertType<HarnessModelName>("claude-code-2.1.311/nonexistent-model-001");
    // @ts-expect-error - another harness's model
    assertType<HarnessModelName>("claude-code-2.1.311/fake-model-small-001");
    // @ts-expect-error - no model ID
    assertType<HarnessModelName>("claude-code-2.1.311");
    // @ts-expect-error - a version with no harness folder
    assertType<HarnessModelName>("claude-code-2.1.326/claude-haiku-5-5");
  });
});
