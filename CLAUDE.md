
## Agent Instructions


### Creating a new file 
When creating a new file add the following header to the top of it

```typescript
/**
 * 🤖
 * This file was created with AI
 *
 * Harness: (harness name)
 * Model: (model name)
 * Supervising engineer: (get this from git config)
 *
 * Level of human supervision: None (None is the default, but if in an interactive session with a human you can ask to elevate it)
 *
 *
 */

```

Exceptions:
- JSON files and anything else that would break with the presence of the header

### Creating commits, pull requests, issues 

Commits:

Prefix with `🤖 Commit created by AI`

PRs and Issues: 

```md
---
🤖 Content created by AI. 

 * Harness: (harness name)
 * Model: (model name)
 * Supervising engineer: (get this from git config)
 *
 * Level of human supervision: None. (Human: edit the comment to add your own notes here)

---
```

---

This project is tracked here:  [dwjohnston/1 GitHub Project](https://github.com/users/dwjohnston/projects/1/views/1).

Be aware that the project contains issues for _multiple_ repositories. 




## What is Thunderjar

Thunderjar is a benchmarking framework for measuring how well AI coding agents perform on software engineering tasks. It runs an agent against a codebase, then evaluates the result against a set of defined measurements.

See `docs/terminology.md` for the full glossary. Key concepts:

- **Task** — a starting commit + a prompt. Defines what the agent is asked to do and from what state.
- **Prompt** — a named, reusable configuration that installs prompt files into the worktree via a shell command (e.g. `cp prompts/skills.md CLAUDE.md`). Referenced by ID.
- **Experiment** — a named comparison: one task × arrays of variable values (models, harnesses, prompts). Produces one run per permutation.
- **Run** — a single execution under one specific combination of variable values. Uses a git worktree so runs are isolated.
- **Measurements** — assertions evaluated after a run (file created, grep present/absent, command exit code, correctness test). Defined on the task; the result of a run is the set of measurement outcomes.

## Project structure

```
src/
  # not yet implemented

evaluation-sandbox/  # Self-contained sandbox for testing the framework itself
  thunderjar.config.ts
  prompts/
  output/        
    #agent output lands here during sandbox runs
```

## Running the CLI

From a directory containing a `thunderjar.config.ts`:

```sh
bun <path-to-thunderjar>/src/cli/index.ts run <experimentId>
bun <path-to-thunderjar>/src/cli/index.ts compare --experiment <experimentId>
bun <path-to-thunderjar>/src/cli/index.ts list
```

Results are stored in `bench/results/` as JSON, one file per run.
