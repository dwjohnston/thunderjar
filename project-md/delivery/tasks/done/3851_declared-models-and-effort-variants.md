---
harness: claude-code
model: opus
effort: high
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLhdZHdqX3iGhMMBNN6
Supervising engineer: David Johnston

From the "Harness models handoff" planning session. Puts back the model typings task 3500 dropped.

Humans: add your notes here
-->

# 3851: Declared models and effort variants

A harness declares the models it runs, by their real IDs, and a test case may only name those. A model's settings can have variants, such as an effort level, and the test case names one as an extra part of the pair.

## Version bump type

minor

Breaking: a test case must name every variant part, and `declareHarness` requires `models`.

## Artifacts

- `declareHarness` takes `models`, which is required.
  - Each model ID maps to an array of its settings, one setting per entry.
  - e.g.
    ```ts
    export default declareHarness({
      version: "0.166.0",
      models: {
        "openai/gpt-5.5": [],
        "openai/gpt-6.1-sol": [{ reasoningEffort: { values: ["low", "medium", "high"] } }],
      },
      applyParameter: (_config, ctx) => `…${ctx.model.reasoningEffort}…`,
    });
    ```
- Settings
  - A fixed setting, e.g. `{ reasoningEffort: "low" }`, adds nothing to the name.
  - A variant setting, `{ values: [...] }`, adds one name part. There is no default: the part is required.
  - Several variant settings make the full cross product, parts in array order.
    - e.g. `[{ effort: { values: ["low", "high"] } }, { thinkingTokens: { values: [8000, 32000] } }]` gives `…/low/8000`, `…/low/32000`, `…/high/8000` and `…/high/32000`.
- Pair names
  - `<harness folder>/<model ID>/<variant part>…`, e.g. `codex-0.166.0-openrouter/openai/gpt-6.1-sol/high`.
  - Split: the harness folder, then the longest declared model ID that matches (IDs hold `/`), then one part per variant setting.
  - The name is used as written everywhere: `plan`, run records, the hash, `show`, `compare`. Nothing is expanded.
- `applyParameter`'s `ctx`
  - `ctx.modelId` stays the model ID alone, e.g. `openai/gpt-6.1-sol`. It's what the agent is given.
  - `ctx.model` holds the settings with each variant's chosen value, e.g. `{ reasoningEffort: "high" }`.
- `generate`
  - Loads each harness and writes its names out as a literal union.
  - A harness that fails to load gets a warning and accepts any model, `` `<harness>/${string}` ``, so scenario 0403 keeps passing.
- `plan` and `run`
  - Reject an undeclared name, listing the declared ones.
- Migration, one-off
  - Rewrites recorded runs, and the test cases in `.thunderjar/`, to full names.
  - The level is hard-coded in the migration, per harness: each agent's documented default effort level. It isn't configured anywhere.
  - No upgrade path for other users: the maintainer is the only one.
- `.thunderjar/parameters/harnessModels/` declares `models` for each harness, with the models its test cases use.
- PRDs 004 and 064 are corrected: they say any model ID is accepted.

```ts
// generated: _generated/parameterNames.d.ts
type HarnessModelName =
  | "codex-0.166.0-openrouter/openai/gpt-5.5"
  | "codex-0.166.0-openrouter/openai/gpt-6.1-sol/low"
  | "codex-0.166.0-openrouter/openai/gpt-6.1-sol/medium"
  | "codex-0.166.0-openrouter/openai/gpt-6.1-sol/high"
  | `fake-harness-beta/${string}`; // failed to load
```

## Example CLI Output

```
$ thunderjar plan compare-codex
Error: .thunderjar/test-cases/compare-codex.ts: harnessModel: "codex-0.166.0-openrouter/openai/gpt-6.1-sol" names no reasoningEffort. Its names: openai/gpt-6.1-sol/low, openai/gpt-6.1-sol/medium, openai/gpt-6.1-sol/high

$ thunderjar plan compare-codex
Error: .thunderjar/test-cases/compare-codex.ts: harnessModel: "codex-0.166.0-openrouter/openai/gpt-9" is not a model of codex-0.166.0-openrouter. Its models: openai/gpt-5.5, openai/gpt-6.1-sol
```

## Tests

- File creating tests of `generate`: the literal union, and the warning for a harness that fails to load.
- Fixture + stdout tests of `plan`: undeclared model, missing variant part, unknown variant value.
- Type tests in scenario 0201's `parameterNames.test.ts`, restored. Name what doesn't exist explicitly, e.g.
  ```ts
  assertType<HarnessModelName>("fake-harness-alpha/fake-model-small-001");
  // @ts-expect-error - not a declared model
  assertType<HarnessModelName>("fake-harness-alpha/nonexistent-model-large-001");
  // @ts-expect-error - no model ID
  assertType<HarnessModelName>("fake-harness-alpha");
  // @ts-expect-error - not a declared harness
  assertType<HarnessModelName>("nonexistent-harness/fake-model-small-001");
  ```
- Unit tests of splitting a pair and of the cross product.
- Unit tests of the migration.
- The installed package's smoke test.

## Human interventions

None.
