# 1600: Required environment variables

A harness's `requiredEnv` reaches its containers as `docker run -e NAME`, and `plan` and `run` stop before building anything when one is unset.

Today `requiredEnv` is declared but never used, so a real agent never gets its API key. See [064](../../prd/064-harness.md#requiredenv-credentials).

## Version bump type

minor

## Artifacts

- `run` passes each harness's `requiredEnv` names into that harness's containers only
- `plan` and `run` fail fast, naming the variable and the harness that needs it
- `run --dry-run` lists the variables each container run is given, by name only

## Example CLI Output

```
$ thunderjar run typical
Error: fake-harness-alpha needs FAKE_HARNESS_KEY, which is not set.
Export it in the shell that runs thunderjar.
```

```
$ FAKE_HARNESS_KEY=abc thunderjar run typical --dry-run
...
 1  iteration 1/5  fake-harness-alpha | plain
    env:      FAKE_HARNESS_KEY
    command:  ...
```

## Tests

- Config in, check stdout and stderr, against `0202_typical_project` with a `requiredEnv` added to `fake-harness-alpha`
- Run on docker container tests: the fake agent records whether its variable was set, and `fake-harness-beta`'s containers don't see alpha's variable

## Human interventions

None.
