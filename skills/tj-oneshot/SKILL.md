---
name: tj-oneshot
description: Run a prompt once in a captured coding-agent subprocess, in a fresh worktree, then open a pull request if it changed code, or reply with its answer if it didn't. Only invoked by the user, e.g. `/tj-oneshot add an is prime function`, `/tj-oneshot --harness codex fix issue #42`.
disable-model-invocation: true
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: blacksheep-bot


Humans: add your notes here


-->

# One-shot

Hand the user's prompt to a fresh agent, captured by thunderjar, so the run can be replayed as an eval later.

You are the orchestrator. You don't do the task yourself.

```text
/tj-oneshot add an is prime function
/tj-oneshot what does x.js do?
/tj-oneshot --harness codex fix issue #42
```

✅ **Do this**

- Pass the prompt on, and report what the subprocess did.

❌ **Don't do that**

- Don't edit code, answer the question, or fix the subprocess's work yourself.

**Rationale:** the capture must hold the whole run. Work you do outside it is missing from the replay.

## 1. Pre-checks

1. Choose the harness: `claude-code`, `codex`, `copilot` or `opencode`.
   - The default is the harness you are running under.
   - `--harness <id>` at the start of the argument overrides it. Strip it from the prompt.
2. Check that capture hooks for that harness are installed. Look for `thunderjar capture` in its config:

   | Harness | Project config | User config |
   |---|---|---|
   | `claude-code` | `.claude/settings.local.json` | `~/.claude/settings.json` |
   | `codex` | `.codex/hooks.json` | `$CODEX_HOME/hooks.json`, default `~/.codex` |
   | `copilot` | `.github/hooks/thunderjar-capture.json` | `$COPILOT_HOME/hooks/thunderjar-capture.json`, default `~/.copilot` |
   | `opencode` | `.opencode/plugins/thunderjar-capture.ts` | `$XDG_CONFIG_HOME/opencode/plugins/thunderjar-capture.ts`, default `~/.config` |

   - Not installed: stop, and suggest `thunderjar capture install --harness <id>`.
3. For Codex, remind the user that Codex runs the hooks only once they're trusted in `/hooks`.

## 2. Resolve external context

1. Find the references in the prompt that need outside data: issues, pull requests, URLs.
2. Fetch each one, e.g. `gh issue view 42 --comments`.
3. Collect them in a context block, each under its own heading.
4. Rewrite the prompt so each reference points to the context instead.

```text
# 👍 Good
Fix the issue described in the Context section.
```

```text
# 👎 Bad
fix issue #42
```

✅ **Do this**

- Keep everything else in the prompt exactly as the user wrote it.

❌ **Don't do that**

- Don't reword, expand or fix the rest of the prompt.

**Rationale:** with a bare reference the subprocess may fetch it itself, and a replay would then depend on the internet. The rest stays verbatim because it is the eval's prompt.

## 3. Create a worktree

```sh
git fetch origin
git worktree add -b oneshot/<slug> .claude/worktrees/oneshot-<slug> origin/main
```

- `<slug>` is 3 to 6 kebab-case words from the prompt, e.g. `oneshot/add-is-prime-function`.
- Use the remote's default branch if it isn't `main`.
- Install dependencies in the worktree, by lockfile:

  | Lockfile | Command |
  |---|---|
  | `bun.lock` | `bun install` |
  | `package-lock.json` | `npm ci` |
  | `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
  | none | skip |

**Rationale:** a fresh branch from the base gives the run a clean, known starting point, and keeps your own working tree out of it.

## 4. Snapshot the sessions

```sh
thunderjar capture list --json | jq -r '.[].session' > <scratch>/sessions-before.txt
```

## 5. Spawn the subprocess

Run it in the worktree, with `THUNDERJAR_CAPTURE=1`, and the prompt from [Subprocess prompt](#subprocess-prompt):

| Harness | Command |
|---|---|
| `claude-code` | `claude -p "<prompt>"` |
| `codex` | `codex exec "<prompt>"` |
| `copilot` | `copilot -p "<prompt>" --allow-all-tools` |
| `opencode` | `opencode run "<prompt>"` |

- Pass the prompt from a file or heredoc, not by hand-escaping quotes.
- Keep its reply: you need it in step 8.
- Give it a long timeout. A run can take many minutes.

**Rationale:** `THUNDERJAR_CAPTURE=1` overrides a `0` inherited from your own session.

## 6. Identify the session

Run `thunderjar capture list --json` again, and compare with the snapshot.

- Exactly one new session: that is the run. Its `start.repository.root` should be the worktree.
- None, or several: stop, keep the worktree, and tell the user.

**Rationale:** guessing the wrong session would attach someone else's run to the pull request.

## 7. Push the capture

```sh
thunderjar capture push
```

## 8. Choose the path

Count the commits on the worktree branch since the base: `git -C <worktree> rev-list --count origin/main..HEAD`.

### Commits: the change path

1. Push the branch: `git -C <worktree> push -u origin oneshot/<slug>`.
2. Take the last `<pr-title>` and `<pr-body>` from the reply.
   - Missing: use the first commit's subject as the title and the whole reply as the body, and tell the user.
3. Open the pull request with `gh pr create --head oneshot/<slug>`. The body is the subprocess's description, then the capture:

   ````markdown
   <pr-body>

   <details><summary>Thunderjar capture</summary>

   ```text
   <output of `thunderjar capture show <session>`>
   ```

   </details>
   ````

4. Remove the worktree: `git worktree remove <path>`.
5. Reply with the pull request URL.

### No commits: the question path

1. Show the user the subprocess's reply.
2. Print the output of `thunderjar capture show <session>`.
3. Remove the worktree and its empty branch: `git worktree remove <path>`, then `git branch -D oneshot/<slug>`.

### Failure

The subprocess exited non-zero.

1. Push the capture anyway.
2. Keep the worktree for inspection.
3. Tell the user: the exit code, the session ID, and the worktree path.

**Rationale:** a failed run is still a useful eval, and its worktree shows what went wrong.

## Subprocess prompt

`<context>` is the block from step 2. Leave out the Context section when it is empty.

````text
<user prompt, with external references rewritten>

## Context
<context>

## Rules
Don't access the internet. Local processes (e.g. localhost servers) are fine.
Everything external you need is included above.
If you need external information that isn't provided, stop and say what's missing in your reply.

Don't add new dependencies. If the task needs one, don't do the task; say which dependency and why in your reply, then stop.

Commit your changes to the current branch. Don't push, and don't create a pull request.

If you made changes, end your reply with a pull request description in exactly this form:

<pr-title>One-line title</pr-title>
<pr-body>
Markdown body: what changed and why.
</pr-body>

If you made no changes, just answer. Don't include these tags.
````

The capture's start record stores this whole prompt, so a replay doesn't need the internet.

## Notes

- Capturing your own session too is harmless: its start record exists before the spawn, so the before/after comparison ignores it.
- The capture store is left at its default: `branch` in Claude Code cloud, otherwise `refs`. `capture list` and `capture show` read both.
- Codex, Copilot and OpenCode capture haven't been run end to end yet. The first one-shot with each is effectively its test, so check the capture closely.
