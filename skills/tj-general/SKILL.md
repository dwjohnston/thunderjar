---
name: tj-general
description: How Thunderjar builds an experiment's image, i.e. the order its parameters' Dockerfile fragments are applied in, and the files each one writes. Use when writing or debugging any Thunderjar parameter, e.g. a code state, prompt set, harness or initial prompt.
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Thunderjar in general

## Apply order

Each parameter's `applyParameter` returns a Dockerfile fragment. Thunderjar joins them in this order:

| # | Fragment | Does | Files it typically creates |
|---|---|---|---|
| 1 | Base image | Must start with `FROM` | – |
| – | `WORKDIR /workspace` | Added by Thunderjar, not a parameter | – |
| 2 | Code state | Gets the codebase into `/workspace` | The codebase, in `/workspace` |
| 3 | Prompt set | Puts its prompt files in `/workspace` | e.g. `AGENTS.md`, skills, in `/workspace` |
| 4 | Harness | Installs the agent, writes the run script and the model ID | `/thunderjar/thunderjar-run.sh`, `/thunderjar/model.txt` |
| 5 | Initial prompt | Writes the prompt; may set `WORKDIR` | `/thunderjar/prompt.txt` |
| – | Run script, at run time | Runs the agent | `/thunderjar/result.json` |

Then each iteration runs `sh /thunderjar/thunderjar-run.sh`, and nothing else.

- The last `WORKDIR` is where the agent works. An initial prompt's overrides a code state's.
- The run script runs as the image's last `USER`, usually set by the harness. Earlier fragments run as root, so whatever they create in `/workspace` must be usable by that user.
- A fragment may only use its own `files/` folder, through `ctx.dir`. Naming another parameter's folder is a config error.
