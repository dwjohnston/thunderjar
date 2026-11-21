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
| Which tools did it call, and how often? | `toolCalled` | `{ tool, inputMatches? }` |
| Anything else | `shell` | `{ command }` |

`toolCalled` reads the agent's own transcript, sub-agents' included, from its postrun image. `tool` is the harness's own name for it, e.g. `Bash` in Claude Code, `bash` in OpenCode, `exec_command` in Codex. A run whose harness declares no `transcript` is skipped.

`shell` runs in the agent's container after it finishes, in the folder it started in. Its value is the exit code and stdout.

It sees the run's environment variables: the test case's `env` and `secretEnv`, and the harness's `requiredEnv`, e.g. `DATABASE_URL` for a command that queries the database.

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

// toolCalled: did it run the tests, and how many times? Claude Code calls its shell tool Bash.
{ instrument: "toolCalled", config: { tool: "Bash", inputMatches: "bun test" }, metrics: { ranTests: { stat: "rate", better: "higher" }, testRuns: { score: (v) => v, stat: "mean" } } }

// shell: does the project still typecheck?
{ instrument: "shell", config: { command: "bun run typecheck" }, metrics: { typeChecks: { stat: "rate", better: "higher" } } }
```

#### `shell` techniques

| Technique | e.g. |
|---|---|
| Run the project's own checks, rather than a grep that approximates them | `bun run typecheck`, `bun test` |
| Exercise the behaviour | run the CLI with the new flag, and parse its output |
| One command, several metrics | run `list --json` once, then score whether it printed valid JSON, and whether that's an array (full example under Metrics) |
| Compare with the starting point: files touched, lines changed | `git diff --stat thunderjar-start` |
| Check what the agent left behind, e.g. commits it made | `git log --oneline thunderjar-start..HEAD` |

`thunderjar-start` is the tag the code state puts on its starting commit.

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

e.g. one command feeding several metrics, for "add a --json flag to the list command":

```ts
// The agent's new --json output, parsed, or undefined if the command failed or printed anything but JSON.
const parsed = (v: { exitCode: number; stdout: string }) => {
  if (v.exitCode !== 0) return undefined;
  try {
    return JSON.parse(v.stdout) as unknown;
  } catch {
    return undefined;
  }
};

export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run src/cli.ts list --json" },
  metrics: {
    // Ran, but printed something other than JSON, e.g. a header line above it.
    validJson: { score: (v) => (v.exitCode === 0 ? parsed(v) !== undefined : undefined), stat: "rate", better: "higher" },
    // Doesn't apply when there's no JSON to read.
    isArray: { score: (v) => (parsed(v) === undefined ? undefined : Array.isArray(parsed(v))), stat: "rate", better: "higher" },
  },
});
```

✅ **Do** return `undefined` when the metric doesn't apply, e.g. the file it reads is missing.
