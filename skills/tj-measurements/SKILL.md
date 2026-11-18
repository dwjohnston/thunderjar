---
name: tj-measurements
description: Add or change the measurements of a Thunderjar task, i.e. the checks that score each run, using the built-in instruments or a shell command. Use when the user wants to score a task, e.g. "check that it added a test", "measure whether it followed AGENTS.md", "add an eval to this task".
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Write measurements

A measurement is one check, run after each run of a task.

e.g.

```ts
import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run typecheck" },
  metrics: { typeChecks: { stat: "rate", better: "higher" } },
});
```

They live at `.thunderjar/parameters/tasks/<task>/measurements/<name>.ts`, one file per check.

## Steps

1. List what "done" means
2. Find the trap
3. Pick an instrument for each check
4. Declare its metrics
5. Check it against the starting state

### 1. List what "done" means

Write each part of "done" as something you can check after the run.

e.g. for "add a --json flag to the list command":

1. The command accepts the flag.
2. Its output with the flag is valid JSON.
3. A test covers the flag.
4. The typecheck and test suite still pass.

✅ **Do** measure each part separately.

❌ **Don't** fold everything into one pass/fail check.

**Why:** separate checks show where agents fail. One combined check only says that they did.

### 2. Find the trap

Ask: what could the agent skip, or get wrong, and still look done? Measure that directly.

e.g. the agent adds the flag, but still prints a header line above the JSON. A grep for the flag passes, and so does the test suite if no test parses the output. So: run the command and parse what it prints.

When the task comes from a capture, the trap is usually what went wrong in it, e.g. "didn't invoke the skill".

**Why:** checks that pass by accident make an agent look better than it is. The trap is usually what tells agents apart.

### 3. Pick an instrument for each check

Use the cheapest instrument that answers the question.

| Question | Instrument | Config |
|---|---|---|
| Does a file exist? | `fileCreated` | `{ glob }` |
| How many lines match? | `grep` | `{ glob, pattern }` |
| Does the code behave? | `bunTestFile` | `{ subject, test }` |
| What did the agent say? | `replyMatches` | `{ pattern, turn? }` |
| Anything else | `shell` | `{ command }` |

`shell` runs in the agent's container after it finishes, in the folder it started in. Its value is the exit code and stdout.

#### `shell` techniques

1. Run the project's own checks
   - e.g. `bun run typecheck`, `bun test`
   - ✅ **Do** prefer these over a grep that approximates them.
2. Exercise the behaviour
   - e.g. run the CLI with the new flag, and parse its output.
3. One command, several metrics
   - Print JSON, and parse it in each metric's `score`. See step 4.
4. Compare with the starting point
   - e.g. `git diff --stat thunderjar-start`, the tag the code state puts on its starting commit
   - For files touched, lines changed, files that shouldn't have changed.
5. Check what the agent left behind
   - e.g. `git log --oneline thunderjar-start..HEAD` for commits it made.

❌ **Don't** check the contents of generated files, e.g. a grep on a file that a `generate` command writes.

Exception: the task is about changing the generator.

**Why:** if the generated file is wrong, the generator is at fault, not the agent.

⚠️ **Warning:** `shell` stores stdout as it is, up to 64 KiB. A command that prints secrets will store them.

#### Measuring behaviour

Some tasks are about how the agent works, not what it produced, e.g. "did it follow HUMANS.md", "did it invoke the skill".

No instrument reads the agent's transcript. Only its replies and its files can be measured. So measure a trace the behaviour leaves:

- A marker in the reply that only the instruction asks for
  - e.g. HUMANS.md asks for ☝️ in every response: `replyMatches` with `{ pattern: "☝️" }`
- A format that only the skill asks for
  - e.g. the skill says to write a summary in a set shape: grep for that shape.
- A file that only the skill creates

✅ **Do** choose a marker the agent wouldn't produce without the instruction.

**Why:** a marker an agent might produce anyway measures nothing.

### 4. Declare its metrics

Each measurement declares its `metrics`: what to read from the instrument's value, and how to combine it across runs.

- `score`
  - Reads one run's value as a number or boolean, or `undefined` when the metric doesn't apply.
  - Leave it out to use the instrument's default, e.g. exit 0 for `shell`, the pass rate for `bunTestFile`.
- `stat`
  - `rate` or `count` for booleans.
  - `mean`, `median`, `min`, `max` or `sum` for numbers.
- `better`
  - `"higher"`, `"lower"`, or left out when neither is.

e.g. one command feeding several metrics:

```ts
const counts = (v: { exitCode: number; stdout: string }) =>
  v.exitCode === 0 ? (JSON.parse(v.stdout) as { lines: number; exports: number }) : undefined;

export default declareMeasurement({
  instrument: "shell",
  config: { command: "node scripts/count.js src/list.ts" },
  metrics: {
    lines: { score: (v) => counts(v)?.lines, stat: "median", better: "lower" },
    singleExport: { score: (v) => (counts(v) ? counts(v)!.exports === 1 : undefined), stat: "rate", better: "higher" },
  },
});
```

✅ **Do** return `undefined` when the metric doesn't apply, e.g. the file it reads is missing.

❌ **Don't** return 0 or `false` to mean "doesn't apply".

**Why:** a 0 is counted, and drags the statistic down. `undefined` leaves the run out, and `show` says why.

### 5. Check it against the starting state

Each check for the task's own changes should fail on the code state before any agent runs. The typecheck and test suite should pass.

See tj-codestate, step 6.

**Why:** a check that already passes measures nothing.
