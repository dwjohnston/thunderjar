---
name: tj-meta-pull-request-description
description: Write the description of a pull request on the thunderjar repo itself. Use when opening or updating a PR here, especially one that adds, changes or removes skills.
---

# Pull request descriptions for this repo

Start with the AI-generated header from `ai-generated-content-header`, then the sections below. End with the attribution line from the session.

## Sections

1. **Summary**: one or two sentences on what the PR does and why.
2. **What's in it**: bullets grouped by area (config, tasks, test cases, skills, docs, notes).
3. **Not yet verified**: anything untested or known to be incomplete. Omit if there is none.
4. **Review focus**: the files or decisions a reviewer should look at. Omit if there is none.

## Skills

This repo has two kinds of skill. Never mix them in one list.

| Kind | Lives in | For | Link |
|---|---|---|---|
| Installed | `.agents/skills/` | Agents working on this repo | None |
| Published | `skills/` | Users of thunderjar. | `.agents/skills/<name>` links to `skills/<name>` so agents here get them too |

A skill under `skills/` is published. A skill that is only under `.agents/skills/`, with no link into `skills/`, is installed.

### Installed skills

List them by name only. No description, no link, no summary of the edit.

```markdown
- **Installed skills**
  - New: `concise-output`, `ai-generated-content-header`.
  - Changed: `ts-write-script`, `write-for-the-human`.
  - Removed: `old-skill`.
```

Leave out any of New, Changed, Removed that is empty.

### Published skills

Describe each one: what it is for, and what changed. Link to its `SKILL.md`. These ship to users, so reviewers read them as product changes.

```markdown
- **Published skills**
  - New: [tj-config](skills/tj-config/SKILL.md) edits `thunderjar.config.ts`.
  - Changed: [tj-eval](skills/tj-eval/SKILL.md) now uses a generic example task.
```

### Finding which is which

```bash
git diff --name-status main... -- .agents/skills skills
```

- A path under `skills/` is published.
- A path under `.agents/skills/` that is a symlink into `skills/` is published. It is a link, not a separate installed skill, so do not list it twice.
- Any other path under `.agents/skills/` is installed.

## Style

Follow `concise-output`. Name things; do not narrate the diff.
