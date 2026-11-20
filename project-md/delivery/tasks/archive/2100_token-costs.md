# 2100: Token costs

After each container run, its harness's `collectTokenCosts` reads the result files, and the token counts and cost are recorded, printed by `run`, and shown per permutation by `show`.

Collected for every run without being declared, as [087](../../prd/087-collecting-token-costs.md) sets out. Summed across turns.

## Version bump type

minor

## Artifacts

- Token costs recorded in the run data store for each container run
- `run` prints each run's cost
- `show` adds mean tokens and cost per permutation, and the per-model breakdown for one container run
- `init`'s scaffolded `collectTokenCosts` parses `claude -p --output-format json`

## Example CLI Output

```
$ thunderjar show <ULID>
                                          mentions-eli   tokens (mean)   cost (mean)
 1  snerk | fake-harness-alpha | plain    5/5            12,480          $0.061
 2  snerk | fake-harness-beta  | plain    0/5            not reported    -
```

## Tests

- Run on docker container tests: the fake agents write Claude-shaped result files
- Fixture + stdout tests for `show`, against `0203_recorded_executions`
- Unit tests for the scaffolded Claude Code collector, against a real result file

## Human interventions

- Commit one real `claude -p --output-format json` result as a test fixture, so the collector is tested against what Claude Code actually writes. Needs an API key once.
