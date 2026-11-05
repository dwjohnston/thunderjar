---
name: tj-quick-capture
description: Record what just went wrong in this session as a JSON file in `.thunderjar/quickCaptures/`, so it can be turned into an eval later. Only invoked by the user, e.g. `/tj-quick-capture "Agent did not invoke /x skill"`.
disable-model-invocation: true
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: 09203808-4422-4924-9ab7-99fc465f136c
Supervising engineer: blacksheep-bot


Humans: add your notes here


-->

# Quick capture

The user has seen an agent, usually you, get something wrong. Write down the facts of the session, so the failure can be reproduced later as a Thunderjar eval.

The argument is the user's complaint, e.g. `"Agent did not invoke /x skill, /y skill"`.

The user may instead ask you to capture another session, by its ID. Then follow [Capturing another session](#capturing-another-session) as well.

## Steps

1. Gather the environment facts with the commands below.
2. Fill in the JSON from the conversation.
3. Write it to `.thunderjar/quickCaptures/<timestamp>_<slug>.json`, at the repository root.
   - `<timestamp>` is UTC, `YYYYMMDDTHHMMSSZ`, e.g. `20261105T215300Z`.
   - `<slug>` is 3 to 6 kebab-case words from the complaint, e.g. `skill-not-invoked`.
4. Commit the capture file, and only that file.
5. Reply with the file's path, and one line on what you captured. Nothing else.

The commit message is `⚡ thunderjar quick capture: <problem description>`, where the description is the user's complaint:

```sh
# 👍 Good
git add .thunderjar/quickCaptures/20261105T215300Z_skill-not-invoked.json
git commit -m "⚡ thunderjar quick capture: Agent did not invoke /x skill, /y skill"
```

```sh
git rev-parse --show-toplevel
git rev-parse HEAD
git branch --show-current
git status --porcelain
git diff --stat HEAD
git log --oneline -10
```

✅ **Do this**

- Stop what you were doing, write the capture, and end the turn.

❌ **Don't do that**

- Don't fix the problem, apologise at length, or retry the task.
- Don't change any file other than the capture.

**Rationale:** the capture is a snapshot of the broken state. Fixing things first changes the state, and the fix belongs in a later, separate turn.

## The JSON

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-11-05T21:53:00Z",
  "complaint": "Agent did not invoke /x skill, /y skill",
  "capturedBy": null,

  "agent": {
    "harness": "Claude Code",
    "harnessVersion": "2.1.316",
    "harnessSurface": "VS Code extension",
    "model": "claude-opus-5-5",
    "sessionId": "09203808-4422-4924-9ab7-99fc465f136c",
    "transcriptPath": "~/.claude/projects/-workspace-thunderjar/09203808-4422-4924-9ab7-99fc465f136c.jsonl",
    "permissionMode": "auto"
  },

  "repository": {
    "root": "/workspace/thunderjar",
    "branch": "start-dog-fooding-thunderjar",
    "headCommit": "9839823…",
    "commitAtSessionStart": "1d52f23…",
    "hasUncommittedChanges": true,
    "uncommittedFiles": ["?? skills/tj-quick-capture/"],
    "diffStat": " 1 file changed, 40 insertions(+)",
    "commitsMadeThisSession": ["9839823 🤖 Claude: Add …"]
  },

  "conversation": {
    "initialTask": { "text": "Help me populate this skill …", "verbatim": true },
    "subsequentUserTurns": [
      { "text": "use X instead", "verbatim": true }
    ]
  },

  "context": {
    "instructionFiles": ["CLAUDE.md", "AGENTS.md"],
    "skillsAvailable": ["tj-config", "tj-eval", "x", "y"],
    "skillsInvoked": ["tj-config"],
    "filesChanged": ["skills/tj-quick-capture/SKILL.md"],
    "keyActions": [
      "Read skills/tj-config/SKILL.md",
      "Wrote skills/tj-quick-capture/SKILL.md without invoking /x"
    ]
  },

  "agentAnalysis": {
    "expected": "Invoke /x before writing the skill, as its description covers new SKILL.md files.",
    "actual": "Wrote the file directly. /x was listed but not invoked.",
    "suspectedCause": "The /x description names AGENTS.md but not SKILL.md."
  }
}
```

### Where each field comes from

| Field | Source |
|---|---|
| `capturedBy` | `null` for your own session. See [Capturing another session](#capturing-another-session) |
| `agent.*` | What your system prompt and environment tell you. `harnessVersion` from e.g. `claude --version` |
| `agent.transcriptPath` | The harness's session log, if you know where it is. It holds the full record, so it is the most useful field |
| `repository.*` | The git commands above. `commitAtSessionStart` from the git status you were given at the start, if any |
| `conversation.*` | The user's messages, in order. Exclude the `/tj-quick-capture` turn itself |
| `context.*` | Your own record of the session |
| `agentAnalysis` | Your reading of what went wrong |

### Verbatim text

✅ **Do this**

- Copy the user's messages character for character, including typos.
- Set `"verbatim": false` on any message you can only reconstruct, e.g. after the conversation was summarised.

❌ **Don't do that**

- Don't tidy, shorten or paraphrase a message and still mark it verbatim.

**Rationale:** the initial task becomes the eval's prompt. A paraphrase may not reproduce the failure, and a reader needs to know which text to trust.

### Unknown values

✅ **Do this**

- Use `null` for anything you can't find out, e.g. `"harnessVersion": null`.

❌ **Don't do that**

- Don't guess a version, a commit or a model ID.

**Rationale:** a wrong fact sends whoever reproduces the failure down the wrong path. A `null` tells them to look it up.

### Keep facts and opinions apart

Put your interpretation only in `agentAnalysis`. Every other field is a fact you can point to.

**Rationale:** you may be the agent that failed, so your explanation is a guess. Keeping it separate lets the reader weigh it on its own.

### Secrets

Replace tokens, API keys and passwords that appear in the conversation with `"<redacted>"`.

**Rationale:** captures may be committed or shared, and a secret in a JSON file is easy to miss.

## Capturing another session

Every fact comes from that session's transcript, not from you.

1. Find the transcript.
   - Claude Code keeps it at `~/.claude/projects/<project>/<session id>.jsonl`.
   - e.g.
     ```sh
     ls ~/.claude/projects/*/7d415040-1ed5-4557-91ca-8b727f3c299c.jsonl
     ```
   - Not found: tell the user, and stop.
2. Read the agent fields from it.
   - e.g.
     ```sh
     jq -r 'select(.type=="assistant") | .message.model' "$f" | sort -u
     jq -r '.version // empty' "$f" | sort -u
     ```
3. Read the user's messages from it.
   - e.g.
     ```sh
     jq -r 'select(.type=="user") | .message.content
       | if type=="string" then . else (.[] | select(.type=="text") | .text) end' "$f"
     ```
   - Skip what the harness added, e.g. `/clear` notices and "the user opened the file" notes.
4. Find the commits it made, from its `git commit` calls.
   - e.g.
     ```sh
     jq -r 'select(.type=="assistant") | .message.content[]
       | select(.type=="tool_use") | .input.command // empty' "$f" | grep "git commit"
     ```
   - `headCommit` is its last commit. `commitAtSessionStart` is the commit before its first.
5. Fill in `capturedBy`.
   - e.g.
     ```json
     "capturedBy": {
       "sessionId": "09203808-4422-4924-9ab7-99fc465f136c",
       "note": "Captured from another session's transcript, after the fact."
     }
     ```
6. Name the captured session in the commit body.
   - e.g.
     ```sh
     git commit -m "⚡ thunderjar quick capture: Did not invoke /write-for-the-human" \
       -m "Captured on behalf of session 7d415040-1ed5-4557-91ca-8b727f3c299c, whose work is commit 9839823."
     ```

✅ **Do this**

- Record the repository as it was when that session worked.
- Set the uncommitted-change fields to `null`, unless the transcript shows them.

❌ **Don't do that**

- Don't use the current `HEAD`, or your own model and version.

**Rationale:** other sessions may have committed since, so the current state is not the state the failure happened in. The eval needs that session's starting commit to reproduce it.
