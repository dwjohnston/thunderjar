# 1900: Measuring the agent's reply

A harness can read the agent's final reply out of its result file, and new instruments measure that reply, so an experiment can ask "did the answer mention Eli?" and not only "what files changed?".

This is what the ai-experiments repository measures: every experiment there passes or fails on what the agent said.

## Version bump type

minor

## Artifacts

- `collectReply(raw)` on a harness: turns its result file into the reply text
- The `replyMatches` instrument: does the reply match `pattern`, a JavaScript regular expression? A boolean
- `show <execution> <container run>` prints the reply
- The fake harnesses reply with different text, so their measurements differ

## Example CLI Output

```
$ thunderjar show <ULID>
                                          mentions-eli   says-arr
 1  snerk | fake-harness-alpha | plain    5/5            0/5
 2  snerk | fake-harness-beta  | plain    0/5            5/5
```

```
$ thunderjar show <ULID> 1-1
Reply:
  The boy's name is Eli.
```

## Tests

- Run on docker container tests, against `0202_typical_project`
- Fixture + stdout tests for `show`, against `0203_recorded_executions`
- Regular unit tests for the instrument

## Human interventions

None.
