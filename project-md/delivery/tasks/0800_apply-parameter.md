# 0800: applyParameter

Each parameter declares what applying it does, through `applyParameter`. The prerun Dockerfile is rendered from those fragments.

From row 16, and the Dockerfile half of row 15. See [planned reapplication](../../research/planned-reapplication.md), step 8.

## Version bump type

minor

## Artifacts

- `applyParameter` on every `declareX`
- The Dockerfile renderer

## Example CLI Output

None. No command changes yet; `build --dry-run` in 0900 prints the result.

## Tests

- unit tests only, for the Dockerfile rendering

## Human interventions

None.
