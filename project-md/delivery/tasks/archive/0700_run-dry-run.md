# 0700: Run dry run

`thunderjar run --dry-run` prints what a run would do, without doing it. Each execution gets a ULID.

From row 6. See [planned reapplication](../../research/planned-reapplication.md), step 7.

## Version bump type

minor

## Artifacts

- `thunderjar run --dry-run`
- ULID execution IDs

## Example CLI Output

```
$ thunderjar run --dry-run
Execution <ULID>

Permutation 1: prerun image thunderjar-prerun:a1b2c3d4
  Iteration 1: postrun image thunderjar-postrun:<ULID>-1-1
    fake-harness-alpha --prompt "..."
...
```

## Tests

- Fixture + stdout tests, against `0202_typical_project`

## Human interventions

None.
