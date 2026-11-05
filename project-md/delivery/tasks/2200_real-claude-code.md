# 2200: A real Claude Code run

`thunderjar init` scaffolds a Claude Code harness that works, and a real-agent test runs it end to end: build, run Claude Code on Haiku, measure, record, show.

Everything before this story runs fake agents. This is the first time Thunderjar drives a real one.

## Version bump type

minor

## Artifacts

- `init`'s scaffolded harness and base image, fixed so they run as they are:
  - runs as a non-root user, since Claude Code refuses to skip permissions as root
  - `--output-format json`, the prompt file, and allowed tools
  - `collectReply` and `collectTokenCosts` for Claude Code's result file
- Scenario `0501_claude_code`, a copy of what `init` scaffolds with a one-line task
- `bun run test:agent`, which runs only with `THUNDERJAR_AGENT_TESTS=1` and `ANTHROPIC_API_KEY` set
- A CI workflow that runs it on demand, not on every push

## Example CLI Output

```
$ ANTHROPIC_API_KEY=... bun run fixture 0501 run example
Execution <ULID>
 1/1  iteration 1/1  claude-code@2.1.283/haiku-4-5 | plain  ... done (<duration>, $0.004)
Wrote .thunderjar/.data/

$ bun run fixture 0501 show <ULID>
                                                               is-prime-ts-exists   cost (mean)
 1  node20 | baseline | snerk | claude-code@2.1.283/haiku-4-5  1/1                  $0.004
```

## Tests

- Real agent tests, a new test type, against `0501_claude_code`
- File creating tests for `init`, updated for the new scaffold

## Human interventions

- Add an `ANTHROPIC_API_KEY` repository secret for the on-demand workflow.
- Each real-agent run costs a few cents on Haiku.
