---
name: tj-oneshot
description: Do a one-shot task while recording it for a Thunderjar eval, i.e. the exact prompt and the code before and after, as git tags. Only invoked by the user, e.g. `/tj-oneshot Add a --verbose flag to the CLI`.
disable-model-invocation: true
hooks:
  Stop:
    - hooks:
        - type: command
          command: 'bun "$CLAUDE_PLUGIN_ROOT/scripts/stop.ts"'
          once: true
          timeout: 120
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: 2c687305-6347-4bf9-986d-08bb47278936
Supervising engineer: blacksheep-bot


Humans: add your notes here


-->

# One-shot

The user has given you a task to do in one go. It is being recorded, so it can be replayed later as a Thunderjar eval.

## Steps

1. Record the start, before anything else:
   ```sh
   bun "${CLAUDE_SKILL_DIR}/scripts/start.ts" --session "${CLAUDE_SESSION_ID}" --effort "${CLAUDE_EFFORT}"
   ```
2. If it fails, report the error and stop. Don't do the task.
3. Do the task below.

The end is recorded for you, when you finish.

## The task

$ARGUMENTS

## While you work

✅ **Do this**

- Do the task exactly as you would without this skill, following your other instructions. Commit, or don't, as you normally would.

❌ **Don't do that**

- Don't mention the recording in your work, e.g. in commit messages, code or your final reply.
- Don't amend, rebase or reset past the `🎯 tj-oneshot start` commit.
- Don't create, move or delete tags under `thunderjar/oneshot/`.

**Rationale:** the recording measures how you do the task when nothing is watching. Rewriting the start commit breaks the link between the start and the end.

<!--
Notes for humans, not needed by the agent.

What gets recorded:

- start.ts commits everything in the working tree (an empty commit when it's clean) and tags it
  thunderjar/oneshot/<session>/start. The tag message holds the prompt, verbatim from the transcript,
  and the harness, model, effort and repository as JSON.
- The Stop hook (stop.ts) commits whatever the agent left uncommitted (again, empty if nothing),
  tags it thunderjar/oneshot/<session>/end, and pushes both tags to origin. `once: true` removes the
  hook after its first successful run.

Reading a recording:

    git fetch origin 'refs/tags/thunderjar/oneshot/*:refs/tags/thunderjar/oneshot/*'
    git tag -l 'thunderjar/oneshot/*'
    git tag -l --format='%(contents)' thunderjar/oneshot/<session>/start
    git diff thunderjar/oneshot/<session>/start thunderjar/oneshot/<session>/end

Requires bun where the agent runs. In Claude Code, a skill's hook gets the skill's folder in
$CLAUDE_PLUGIN_ROOT (seen in 2.1.322, not documented); ${CLAUDE_SKILL_DIR} is empty there.
-->
