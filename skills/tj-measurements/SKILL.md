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


### Precanned instruments

Thunderjar comes with these instruments

| Question | Instrument | Config |
|---|---|---|
| Does a file exist? | `fileCreated` | `{ glob }` |
| How many lines match? | `grep` | `{ glob, pattern }` |
| Does the code behave? | `bunTestFile` | `{ subject, test }` |
| What did the agent say? | `replyMatches` | `{ pattern, turn? }` |
| Anything else | `shell` | `{ command }` |

`shell` runs in the agent's container after it finishes, in the folder it started in. Its value is the exit code and stdout.

e.g. one of each, as the object passed to `declareMeasurement`:

```ts
// fileCreated: did it create isPrime.ts?
{ instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, metrics: { exists: { stat: "rate", better: "higher" } } }

// grep: how many @ts-ignore lines did it leave?
{ instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" }, metrics: { count: { stat: "mean", better: "lower" } } }

// bunTestFile: how many of our tests pass against its isPrime.ts? The test sits beside the measurement.
{ instrument: "bunTestFile", config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" }, metrics: { passRate: { stat: "mean", better: "higher" } } }

// replyMatches: did its last reply include ☝️?
{ instrument: "replyMatches", config: { pattern: "☝️" }, metrics: { followedHumansMd: { stat: "rate", better: "higher" } } }

// shell: does the project still typecheck?
{ instrument: "shell", config: { command: "bun run typecheck" }, metrics: { typeChecks: { stat: "rate", better: "higher" } } }
```

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

### Metrics

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
