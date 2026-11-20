# 0100: Layout and lint rules

Adds the generated oxlint rules that enforce the layer order of `src/`, so every later module lands in its final place and nothing needs restructuring.

A layer is added to the layout when its first module arrives, not up front.

From rows 3 and 19 of the [features table](../../research/fixture-test-patterns.md#features-in-order). See [planned reapplication](../../research/planned-reapplication.md), step 1.

## Version bump type

none

## Artifacts

- Generated oxlint rules for the layer order
- The script that generates them

## Example CLI Output

```
$ bun run lint
Found 0 warnings and 0 errors.
```

## Tests

- unit tests only, for the rule generation

## Human interventions

None.
