---
name: tj-oneshot
description: Do a one-shot task while recording it for a Thunderjar eval, i.e. the exact prompt and the code before and after, as git tags. Only invoked by the user, e.g. `/tj-oneshot Add a --verbose flag to the CLI`.
disable-model-invocation: true
allowed-tools: Bash(git tag -l *)
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: 2c687305-6347-4bf9-986d-08bb47278936
Supervising engineer: blacksheep-bot


Humans: add your notes here. How the recording works is in the plugin's README.md.


-->

# One-shot

The user has given you a task to do in one go.

Recording: !`git tag -l "thunderjar/oneshot/${CLAUDE_SESSION_ID}/start"`

If nothing follows "Recording:" above, the recording isn't running, e.g. the skill was installed without the Thunderjar plugin. Tell the user to install the plugin, as in https://github.com/dwjohnston/thunderjar/tree/main/plugins/thunderjar, and stop. Don't do the task.

**Rationale:** the plugin's hooks record the task. Without them, the work would look recorded but wouldn't be.

## The task

$ARGUMENTS

## While you work

✅ **Do this**

- Do the task exactly as you would without this skill, following your other instructions. Commit, or don't, as you normally would.

❌ **Don't do that**

- Don't mention the `🎯 tj-oneshot start` commit, e.g. in commit messages, code or your final reply.
- Don't amend, rebase or reset past that commit.
- Don't create, move or delete tags under `thunderjar/oneshot/`.

**Rationale:** the task is being recorded, to replay as an eval. The recording should show how you'd do the task anyway, and rewriting the start commit breaks the link between the start and the end.
