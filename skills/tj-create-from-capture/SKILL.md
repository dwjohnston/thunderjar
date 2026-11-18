---
name: tj-create-from-capture
description: Turn a captured coding-agent session into a Thunderjar test case that reproduces it, i.e. the same starting code, prompt, harness and model, with a measurement for what went wrong. Use when the user wants an eval from a past session, e.g. "make a test case from that session", "reproduce session c0599495-7c21-4b7f-9899-d16f3412b9c2".
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Create a test case from a capture

Reproduce a captured session as a test case: same starting code, same prompt, same harness and model. Then measure what went wrong in it.

This skill finds the values. tj-test-case writes the test case with them.

## Steps

1. Find the session
2. Read its records
3. Make the code state
4. Hand off to tj-test-case

### 1. Find the session

Captures are read only through the CLI. Quick captures in `.thunderjar/quickCaptures/` aren't supported yet.

| The user gives | Do |
|---|---|
| A session ID | use it. It must be the full ID, not a prefix. |
| Nothing | run `thunderjar capture list`, and ask which one |

Not found: run `thunderjar capture push --fetch`, then try again. The capture may have been made on another machine.

`capture list` gives each session a verdict. A `one-shot` reproduces best.

### 2. Read its records

```sh
thunderjar capture list --json
```

Take the entry whose `session` is the ID. It holds:

| Field | Becomes |
|---|---|
| `start.prompt` | the initial prompt, word for word |
| `start.agent.harness`, `start.agent.harnessVersion` | the harness |
| `turnRecords[0].agent.models` | the model: usually one. If several, ask which. |
| `startTree` | the code state's tree, see step 3 |
| `turnRecords[].lastAssistantMessage` | what the agent said, to help find what went wrong |

Ask the user what went wrong, unless they've said. That's the trap tj-measurements measures.

⚠️ A session of several turns is reproduced from its first prompt only. Say so to the user.

### 3. Make the code state

The capture's `start` ref points to a snapshot commit of the working tree as it was when the session started, uncommitted changes included. Tag that commit, then make the code state from the tag with tj-codestate.

```sh
SNAPSHOT=$(git rev-parse "refs/thunderjar/capture/<session>/start^{commit}")
git tag tj-<code-state-name> $SNAPSHOT
git push origin tj-<code-state-name>
```

If the session is in the branch store instead, the snapshot is the commit on `thunderjar-capture/<session>` whose tree is `startTree`:

```sh
git log --format='%H %T' thunderjar-capture/<session> | grep <startTree> | cut -d' ' -f1
```

✅ **Do** tag the snapshot, not `headAtStart`.

**Why:** `headAtStart` leaves out the uncommitted changes the agent started with.

### 4. Hand off to tj-test-case

Give it:

- The code state from step 3
- The prompt, word for word
- The harness and model
  - If no folder in `parameters/harnessModels/` has that version, make one with tj-harness-model.
- `promptSet: none`
  - The repo's own AGENTS.md and skills are already in the snapshot.
- What went wrong, from the user, for tj-measurements

✅ **Do** reproduce the session first, before trying a fix.

**Why:** a fix can only be compared with a baseline that fails the same way the session did.
