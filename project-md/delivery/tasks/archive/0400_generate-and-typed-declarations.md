# 0400: Generate and typed declarations

`thunderjar generate` writes the typed parameter names to `_generated/`, so a user's declarations are type-checked.

Adds the minimal existing setup scenario: what `init` scaffolds, with the agent swapped for `fake-harness-alpha`. Running `init` on `0101_empty_project` should produce it, apart from the agent swap.

From row 2. See [planned reapplication](../../research/planned-reapplication.md), step 4.

## Version bump type

minor

## Artifacts

- `thunderjar generate` fills in the existing stub
- The config loader
- Scenario `fixtures/02_regular/0201_minimal_existing_setup/`
- A scenario with type errors, in `fixtures/04_unhappy/`

## Example CLI Output

```
$ thunderjar generate
Wrote .thunderjar/_generated/parameterNames.d.ts
```

## Tests

- Real file creating tests, on a copy of `0201_minimal_existing_setup`
- Type tests: `0201_minimal_existing_setup/parameterNames.test.ts`, beside `project/`
  - Ported from the PR's [`scenario_1_minimal_initial_setup/parameterNames.test.ts`](https://github.com/dwjohnston/thunderjar/pull/24/changes#diff-cc0d3cf26160e165e61897098c036918cd7f24a3913e5a15f99ad087543f56df).
  - Checked by the scenario type-check test from 0200, not run for behaviour. Every `@ts-expect-error` must be a real error, and every other line must compile.
  - e.g.
    ```ts
    it("TaskName", () => {
      assertType<TaskName>("is-prime");
      // @ts-expect-error - not a declared task
      assertType<TaskName>("is-even");
    });
    ```
  - Covers each generated name type, and that `declareTestCase` accepts declared names and rejects undeclared ones.
- The type-check fails for the type-error scenario

## Human interventions

None.
