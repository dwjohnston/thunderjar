# 1400: Measurements and instruments

Measures are taken on each container run after the agent finishes, using the `grep` and `templateTest` instruments.

From rows 9 and 10. See [planned reapplication](../../research/planned-reapplication.md), step 14.

## Version bump type

minor

## Artifacts

- `declareMeasure`
- The `grep` and `templateTest` instruments
- Measurements written to the run data store

## Example CLI Output

```
$ thunderjar run
...
 1/8  iteration 1/5  fake-harness-alpha | plain  ... done
      tests-pass: true   uses-reduce: false
```

## Tests

- Run on docker container tests
- Regular unit tests for the instruments

## Human interventions

None.
