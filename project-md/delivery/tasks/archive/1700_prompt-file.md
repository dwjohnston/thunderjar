# 1700: Prompts reach the agent intact

The initial prompt is written to a file in the container, and the harness's `cli` reads it from `ctx.promptPath`, so quotes, `$`, backticks and newlines reach the agent unchanged.

Today the prompt is pasted into the command, e.g. `claude -p "${ctx.initialPrompt}"`, which breaks on the first `"` in a prompt.

## Version bump type

minor

## Artifacts

- `ctx.promptPath` in a harness's `cli` context
- `init`'s scaffolded harness uses it: `claude -p "$(cat ${ctx.promptPath})"`
- `run --dry-run` shows the prompt file's contents beside the command

## Example CLI Output

```
$ thunderjar run quoting --dry-run
...
 1  iteration 1/1  fake-harness-alpha | awkward
    prompt:   Say "hello", then print $HOME and `whoami`.
    command:  echo-agent --prompt-file /thunderjar/prompt.txt > /thunderjar/result.json
```

## Tests

- Config in, check stdout, for `--dry-run`
- Run on docker container tests: a fake agent copies the prompt file into its result, and the test checks it arrived byte for byte

## Human interventions

None.
