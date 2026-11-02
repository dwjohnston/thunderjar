# 1550: Trace Claude Code sessions in Langfuse

A Claude Code session working in this repository sends each finished turn to Langfuse, when the `LANGFUSE_*` variables are set. It traces the sessions that build Thunderjar, not Thunderjar itself.

See the [orchestration plan](../orchestration-1600-2500.md#trace-the-implementation-session-in-langfuse).

## Version bump type

None. Thunderjar's package doesn't change.

## Artifacts

- The Langfuse skill from `langfuse/skills`, in `.agents/skills/langfuse` and `skills-lock.json`
- `.claude/hooks/langfuse_hook.py`, a Stop hook adapted from [Langfuse's Claude Code guide](https://langfuse.com/integrations/developer-tools/claude-code)
- `.claude/settings.json`, which registers the hook

## What a trace looks like

One trace per turn, grouped into a Langfuse session by Claude Code's session id.

```
claude-code-turn         agent       the prompt -> the last reply
  generate-response      generation  model, tokens, tool calls, thinking when present
  Bash                   tool        input -> output
  generate-response      generation
  Agent                  tool
    run-subagent         agent       the subagent's prompt -> its reply
      generate-response  generation
      Read               tool
  generate-response      generation
```

Changes from Langfuse's script, to follow [their best practices](https://langfuse.com/docs/observability/best-practices):

- Names are stable. Turn and step numbers go in metadata.
- A tool is a sibling of the generation that called it, not its child.
- An assistant message is spread over several transcript rows, one per content block. They're merged, so text and tool calls aren't lost.
- Subagent transcripts are nested under the tool call that started them.
- Turns are split by the transcript's `promptId`, so messages injected mid-turn don't split a turn.
- The environment is `development`, unless `LANGFUSE_TRACING_ENVIRONMENT` says otherwise.

## Turning it on

It does nothing unless `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set. `TRACE_TO_LANGFUSE=false` turns it off when they are.

- `LANGFUSE_BASE_URL`, e.g. `https://us.cloud.langfuse.com`
- The Langfuse Python SDK 4.x: `pip install "langfuse>=4.0,<5"`. Without it the hook exits quietly.
- `CC_LANGFUSE_DEBUG=true` for a verbose log in `~/.claude/state/langfuse_hook.log`

A turn is sent when it ends, so a long turn shows up all at once.

## Checking it

```bash
NODE_USE_ENV_PROXY=1 LANGFUSE_HOST="$LANGFUSE_BASE_URL" \
  npx langfuse-cli api observations list --session-id <session id> --fields core,basic,model,usage
```

`NODE_USE_ENV_PROXY=1` is only needed behind a proxy, as in cloud sessions.

## Human interventions

- The Langfuse keys, in the session's environment
- `langfuse.com` and the Langfuse host in the environment's allowed domains
