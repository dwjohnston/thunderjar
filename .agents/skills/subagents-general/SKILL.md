---
name: subagents-general
description: General conventions for spawning and briefing subagents, and for handling what they report back. Use when delegating work to a subagent.
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiFAvaM4X8UPgmvECj
Supervising engineer: dwjohnston

Humans: add your notes here

-->

# 'spawn a subagent' vs 'spawn a subagent process' 

'Spawn a subagent' means to spawn a subagent via your regular subagent spawning mechanism. 

'Spawn a subagent process' means to spawn a new session with headlessly. 

Eg. if you are claude, you would run `claude -p "the prompt here"` (!!AGENT - update the example). 

**Rationale:** Regular subagents are still tracked as the same session as the main session. Headlessly spawned subagents will get new session ids, which is sometimes what we are looking for. 

