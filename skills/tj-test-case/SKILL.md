---
name: tj-test-case
description: Create a Thunderjar test case, i.e. a file in `.thunderjar/test-cases/` that combines a task, a code state, a promptset, an image and harness/model pairs into one runnable experiment. Use when the user wants to "create a test case" or "set up an experiment". To build one from a captured session ("make a test case from that session"), use tj-create-from-capture, which hands off to this skill. To add or change how a task is scored, use tj-measurements.
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Create a test case

A test case combines parameters into an experiment. It holds no content of its own.

e.g.

```ts
import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["tj-add-json-flag"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.311/claude-haiku-5-5"],
  task: "add-json-flag",
  initialPrompt: ["plain"],
  iterations: 1,
});
```

It lives at `.thunderjar/test-cases/<name>.ts`. Each array is a dimension: every combination of its values is run.

### 1. Fill each field

| Field | Create a new one if | New one through |
|---|---|---|
| `codeState` | The task is relevant to particular state in the codebase. eg. 'fix this bug, that only makes sense at a particular commit'  AND that codestate doesn't already exist. | tj-codestate |
| `promptSet` | Tweaking |
| `task` | The appropriate task does not already eixst.  | step 2 |
| `baseImage`| It makes sense to  | /tj-base-image |
| `baseImage`, `harnessModel` | The user specifically asked for it.  | tj-harness-model |

❌ **Don't** add harnesses, models or promptsets the user didn't ask for.

#### Defaults 

The .thunderjar/AGENTS.md should include instructions about what the default harness model pair should be. 



### 2. Write the task

A task is a folder: `.thunderjar/parameters/tasks/<task>/`, with its initial prompt and measurements.

```ts
// initial-prompts/plain.ts
import { declareInitialPrompt, writePrompt } from "thunderjar";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("add a --json flag to the list command"),
  timeoutSeconds: 900,
});
```

✅ **Do** use the user's prompt word for word, typos and vagueness included.

❌ **Don't** add hints, file paths or acceptance criteria.

**Why:** the test case measures how agents handle the task as people really ask it. A clearer prompt measures a different task.

Then write its measurements with tj-measurements. A task without measurements measures nothing.

### 3. Write the test case

Start with the first-run defaults: one harness and model, one iteration.

**Why:** the first run checks that the measurements work. A broken measurement found after twenty runs costs twenty runs.

### 4. Dry-run it

```sh
thunderjar generate
thunderjar plan <test case>
thunderjar run <test case> --dry-run
```

Then tell the user how to run it, and that once one run measures what they expect, they can widen it with the defaults for comparing.
