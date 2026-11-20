# 1500: Show and aggregation

`thunderjar show` prints the recorded results of an execution, aggregated per permutation, or of a single container run.

From rows 11 and 12. See [planned reapplication](../../research/planned-reapplication.md), step 15.

## Version bump type

minor

## Artifacts

- `thunderjar show <execution>`
- `thunderjar show <execution> <container run>`
- Aggregation of measures across iterations

## Example CLI Output

```
$ thunderjar show 01JB8Z...
                                          tests-pass   uses-reduce
 1  snerk | fake-harness-alpha | plain    5/5          2/5
 2  snerk | fake-harness-alpha | terse    4/5          0/5
...
```

## Tests

- Fixture + stdout tests, against `0203_recorded_executions`

## Human interventions

None.
