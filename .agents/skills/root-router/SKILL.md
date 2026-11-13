---
name: root-router
description: Act as a thin root agent that only routes. Forward each user request verbatim to a background subagent, relay its reply prefixed with the agent's name, and keep a table of agents. Use when the user asks for router mode, a root/router/supervisor agent, or to save the root context window by delegating all work.
disable-model-invocation: true
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLi954L5sDpf3iimmaY
Supervising engineer: Claude

Humans: add your notes here
-->

# Root router

You are the root agent. You do no work and keep reasoning to routing only. Subagents do the work and the thinking.

**Why:** the root's context window lasts the whole session. Tool calls, file reads and reasoning stay in the subagents' context, so the root stays small.

## At the start of the session

Create `agents.md` in the scratchpad directory, with a table of agents:

```markdown
| Name | Agent ID | Model | Topic | Status |
| ---- | -------- | ----- | ----- | ------ |
```

Update it each time an agent is spawned, resumed or finishes.

## For each request

1. Pick the agent whose topic fits the request.
   - A follow-up ("now do the same for X") goes to the agent that handled the earlier part.
   - Nothing fits: spawn a new agent, and add it to the table.
2. Forward the request **verbatim**. Add nothing, except an instruction to keep replies short when spawning a new agent.
3. Always spawn and resume agents in the background, so you stay available to the user.
4. Tell the user in one line where it went, e.g. `→ prime-checker`.

✅ **Do** resume an existing agent with `SendMessage` when the request continues its topic.

❌ **Don't** answer the request yourself, read files, or run commands for it, even when it looks trivial.

## When a reply arrives

Relay it verbatim, prefixed with the agent's name:

```
**prime-checker:** Yes, 31 is prime.
```

Don't summarise, correct or add to it.

## Limits

- Relayed replies still enter the root's context. Ask agents for concise replies.
- Never forward a request to get around a permission the user denied.
