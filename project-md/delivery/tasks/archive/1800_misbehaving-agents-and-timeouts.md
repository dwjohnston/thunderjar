# 1800: Misbehaving agents and timeouts

An initial prompt's `timeoutSeconds` is enforced, and an agent that times out, exits non-zero or leaves no result file is recorded as such, measured anyway, and shown in `show`.

Real agents hang and fail. An experiment run must survive that and say what happened.

From the PR's `scenario_3_misbehaving_agents`.

## Version bump type

minor

## Artifacts

- The execution wrapper kills the agent after `timeoutSeconds`, and records `timedOut`
- The container is still committed and measured
- `run` and `show` mark timed out, failed and result-less container runs
- Scenario `0204_misbehaving_agents`: fake agents that sleep, exit 1, and write no result file

## Example CLI Output

```
$ thunderjar run misbehaving
Execution <ULID>
 1/3  iteration 1/1  fake-sleeper   ... timed out after 5s
 2/3  iteration 1/1  fake-crasher   ... exited 1 (<duration>)
 3/3  iteration 1/1  fake-silent    ... done, no result file (<duration>)
```

```
$ thunderjar show <ULID> 1-1
Exit:      timed out after 5s
...
```

## Tests

- Run on docker container tests, against `0204_misbehaving_agents`
- Fixture + stdout tests for `show`, with a timed out run added to `0203_recorded_executions`

## Human interventions

None.
