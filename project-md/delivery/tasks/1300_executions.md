# 1300: Executions

`thunderjar executions` lists past experiment executions from the run data store.

From row 8. See [planned reapplication](../../research/planned-reapplication.md), step 13.

## Version bump type

minor

## Artifacts

- `thunderjar executions`
- Scenario `fixtures/02_regular/0203_recorded_executions/`, with a run data store checked in

## Example CLI Output

```
$ thunderjar executions
01JB8Z...  2026-10-01 10:12  8 permutations × 5 iterations  complete
01JB9A...  2026-10-02 14:40  2 permutations × 1 iteration   failed
```

## Tests

- Fixture + stdout tests, against `0203_recorded_executions`

## Human interventions

None.
