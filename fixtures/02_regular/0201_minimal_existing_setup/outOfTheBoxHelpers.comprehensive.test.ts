// The other out-of-the-box harness helpers, in the format of outOfTheBoxHelpers.humans.test.ts:
// type tests of the names they give, as `thunderjar generate` wrote them to
// project/.thunderjar/_generated/. Checked by src/testing/scenarios.typecheck.test.ts, not run for
// behaviour: every `@ts-expect-error` must be a real error, and every other line must compile.
import { describe, it } from "bun:test";

function assertType<T>(_value: T) { }

describe("codex(), with its built-in models", () => {
  it("names each of OpenAI's models it declares, at each reasoning effort", () => {
    assertType<HarnessModelName>("codex-0.166.0/gpt-6.1-sol/low");
    assertType<HarnessModelName>("codex-0.166.0/gpt-6.1-sol/medium");
    assertType<HarnessModelName>("codex-0.166.0/gpt-6.1-sol/high");
    assertType<HarnessModelName>("codex-0.166.0/gpt-5.5/low");
    assertType<HarnessModelName>("codex-0.166.0/gpt-5.5/medium");
    assertType<HarnessModelName>("codex-0.166.0/gpt-5.5/high");
  });

  it("names no other model", () => {
    // @ts-expect-error - no reasoning effort
    assertType<HarnessModelName>("codex-0.166.0/gpt-5.5");
    // @ts-expect-error - a reasoning effort it doesn't have
    assertType<HarnessModelName>("codex-0.166.0/gpt-5.5/xhigh");
    // @ts-expect-error - another harness's model
    assertType<HarnessModelName>("codex-0.166.0/claude-haiku-5-5/low");
    // @ts-expect-error - no model ID
    assertType<HarnessModelName>("codex-0.166.0");
    // @ts-expect-error - a version with no harness folder
    assertType<HarnessModelName>("codex-9.9.9/gpt-5.5/low");
  });
});

describe("codex(), with a provider and its own models (custom-codex)", () => {
  it("names its models by the provider's IDs, one pair per reasoning effort", () => {
    assertType<HarnessModelName>("custom-codex/openai/gpt-6.1-sol/low");
    assertType<HarnessModelName>("custom-codex/openai/gpt-6.1-sol/high");
    assertType<HarnessModelName>("custom-codex/openai/gpt-5.5");
  });

  it("names none of the built-in models", () => {
    // @ts-expect-error - a built-in model, not one of its own
    assertType<HarnessModelName>("custom-codex/gpt-5.5/low");
    // @ts-expect-error - no reasoning effort
    assertType<HarnessModelName>("custom-codex/openai/gpt-6.1-sol");
    // @ts-expect-error - a reasoning effort it doesn't have
    assertType<HarnessModelName>("custom-codex/openai/gpt-5.5/high");
  });
});
