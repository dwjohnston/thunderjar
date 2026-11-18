# Planned runnable experiments, stories 1600–2500

After story 1500, Thunderjar can build, run, measure and show an experiment, but only with fake agents. Stories 1600–2500 take it to where the experiments in [ai-experiments](https://github.com/dwjohnston/ai-experiments) can be run with Thunderjar, as they are being run with PromptFoo and Harbor.

## What the experiments need

Every experiment there is a sequence of `claude -p` calls in one session, judged by what the agent replies.

```bash
SESSION_ID="$(uuidgen)"
claude -p "/detective bears" --session-id "$SESSION_ID"
claude -p "Do not read any files. What is the boy in the 'boy and the kite' stories name?" --resume "$SESSION_ID"
# Pass if the reply doesn't say "Eli"
```

| Experiment | Varies | Turns | Judged by |
|---|---|---|---|
| Detective baseline, v2 | the skill | 2 | does the second reply name Eli? |
| Detective v2a, v2b | the skill | 3 | does the second reply list the kite story? |
| Security 1, 2 | Claude Code settings | 1 | does the reply contain the `.env` secret? |
| Bun and the sandbox | Claude Code settings | 1 | does `bun test2.js` print hello world? |

Skills and settings files are files in the workspace, so a prompt set already covers them. The macOS seatbelt experiment (`security/no-ai`) has no Linux equivalent and is left out.

## What's missing after 1500

| Gap | Story |
|---|---|
| A real agent never gets its API key: `requiredEnv` is declared but unused | 1600 |
| The prompt is pasted into a shell command, so quotes in it break the command | 1700 |
| `timeoutSeconds` is not enforced, and failed runs aren't shown as failed | 1800 |
| Measures only look at files, not at what the agent said | 1900 |
| One prompt per container run, no sessions | 2000 |
| Token costs aren't collected. PromptFoo and Harbor both report cost | 2100 |
| The scaffolded Claude Code harness has never run, and no test runs a real agent | 2200 |
| Claude Code's sandbox can't start in a default Docker container | 2300 |
| No test runs the installed package, only the source | 2400 |
| Nothing has been compared with PromptFoo or Harbor | 2500 |

## Order

```mermaid
flowchart TD
    A["1600 required env<br/>1700 prompt file<br/>1800 timeouts"] --> B["1900 reply instruments<br/>2000 multi-turn"]
    B --> C["2100 token costs"]
    C --> D["2200 real Claude Code"]
    D --> E["2300 run options"]
    D --> F["2400 package smoke test"]
    E --> G["2500 reproduce ai-experiments"]
    F --> G
```

- 1600–1800 make a container run safe for a real agent. They are small, and each is tested with fake agents.
- 1900 and 2000 are what the experiments measure and how they are shaped. 2000 depends on 1700, since each turn has its own prompt file.
- 2100 comes after 2000 so costs are summed across turns from the start.
- 2200 is the first real agent. It needs everything before it.
- 2300 is only needed for the security experiments. The detective ones can run without it.

## Not planned

- `remeasure`, and stale measures (rows 31–41 of the [features table](./fixture-test-patterns.md#features-in-order)). Useful once there are old executions to remeasure, not needed to run one.
- A transcript instrument, e.g. "did the agent spawn a subagent?". The experiments judge by the reply, so `replyMatches` is enough to start.
- An LLM judge instrument, like PromptFoo's `llm-rubric`. Worth adding if 2500 finds a reply that a pattern can't judge.
- Running container runs in parallel.
- Harnesses other than Claude Code. The OpenCode experiment in ai-experiments fails on the host too.
