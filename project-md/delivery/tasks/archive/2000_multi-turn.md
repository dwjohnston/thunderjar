# 2000: Multi-turn tasks

An initial prompt can be a list of turns. Each turn runs the harness's `cli` again in the same container and the same agent session, so a later turn can ask about an earlier one.

The detective experiments need this: run `/detective bears`, then, in the same session, ask "What is the boy's name?" without reading any files.

## Version bump type

minor

## Artifacts

- `declareInitialPrompt({ turns: [...] })`, beside the existing single `prompt`
- `cli` gets `ctx.turn` (from 0) and `ctx.sessionId`, a fresh UUID for each container run, so a harness can start a session on turn 0 and resume it after: `--session-id` then `--resume`
- One result file per turn. `collectReply` runs on each
- `replyMatches` takes an optional `turn`. It defaults to the last
- `timeoutSeconds` covers all turns together
- `run --dry-run` prints each turn's command
- Scenario `0205_multi_turn`: a fake agent that keeps what it was told in a file named after the session ID

## Example CLI Output

```
$ thunderjar run remember --dry-run
...
 1  iteration 1/1  fake-harness-alpha | tell-then-ask
    turn 1:  fake-agent --session <session ID> --prompt-file /thunderjar/turns/1/prompt.txt
    turn 2:  fake-agent --resume <session ID> --prompt-file /thunderjar/turns/2/prompt.txt
```

```
$ thunderjar show <ULID> 1-1
Turn 1:  I'll remember that your rubber ducky is called Eli.
Turn 2:  Your rubber ducky is called Eli.
```

## Tests

- Config in, check stdout, for `--dry-run`
- Run on docker container tests, against `0205_multi_turn`

## Human interventions

None.

## Open questions

- Should the turns belong to the initial prompt, as here, or to the task? A prompt set can't add turns either way.
