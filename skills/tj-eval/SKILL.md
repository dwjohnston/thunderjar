---
name: tj-eval
description: Set up a Thunderjar eval for a coding task, i.e. a task folder with its initial prompt and measurements, plus a test case that runs it. Use when the user wants to measure how well agents do a task, e.g. "set up an eval for 'add X to Y'".
---

# Set up an eval

An eval is a task, its measurements, and a test case that runs it.

e.g.

```
.thunderjar/
  parameters/tasks/<task>/
    initial-prompts/plain.ts
    measurements/<one file per check>.ts
  test-cases/<task>.ts
```

## Steps

1. Write the prompt
2. List what "done" means
3. Find the trap
4. Pick an instrument for each check
5. Make the code state able to measure
6. Check the starting state
7. Write the test case and dry-run it

### 1. Write the prompt

Use the user's task word for word as the initial prompt.

e.g.

```ts
import { declareInitialPrompt, writePrompt } from "thunderjar";

export default declareInitialPrompt({
  applyParameter: () => writePrompt("add a --json flag to the list command"),
  timeoutSeconds: 900,
});
```

`writePrompt` writes the prompt into the image, at `/thunderjar/prompt.txt`, where the harness's run script reads it. To run the agent in a subfolder, e.g. one package of a monorepo, add a `WORKDIR` after it: `[writePrompt("…"), "WORKDIR /workspace/packages/cli"].join("\n")`.

✅ **Do** keep the user's wording, typos and vagueness included.

❌ **Don't** add hints, file paths or acceptance criteria to the prompt.

**Why:** The eval measures how agents handle the task as people really ask it. A clearer prompt measures a different task.

### 2. List what "done" means

Write each part of "done" as something you can check in the workspace after the run.

e.g. for "add a --json flag to the list command":

1. The command accepts the flag.
2. Its output with the flag is valid JSON.
3. A test covers the flag.
4. The typecheck and test suite still pass.

✅ **Do** measure each part separately.

❌ **Don't** fold everything into one pass/fail check.

**Why:** Separate checks show where agents fail. One combined check only says that they did.

❌ **Don't** check the contents of generated files, e.g. a `grep` on a file that a `generate` command writes.

Exception: The task genuinely is about changing the behaviour of the generating script. 

**Why:** If that process is failing, it's a problem with the generating script, not of waht the agent did. 

### 3. Find the trap

Ask: what could the agent skip, or get wrong, and still look done? Measure that directly.

e.g. the agent adds the flag but still prints the human-readable header line above the JSON. A `grep` for the flag passes, and so does the test suite, if no test parses the output. So: run the command and parse what it prints.

**Why:** The checks that pass by accident make an agent look better than it is. The trap is usually what tells agents apart.

### 4. Pick an instrument for each check

Use the cheapest instrument that answers the question.

| Question | Instrument |
|---|---|
| Does a file exist? | `fileCreated` |
| How often does some text appear? | `grep` |
| Does the code behave? | `bunTestFile` |
| Does this command pass? | `shell` |
| What did the agent say? | `replyMatches` |

e.g.

```ts
import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run typecheck" },
  metrics: { typeChecks: { stat: "rate", better: "higher" } },
});
```

Each measurement declares its `metrics`: what to read from the instrument's value, and how to combine it across iterations.

- `score` reads one run's value as a number or a boolean, or `undefined` when the metric doesn't apply to that run. Leave it out to use the instrument's default score: the value itself for `fileCreated`, `grep` and `replyMatches`, the pass rate for `bunTestFile`, exit 0 for `shell`.
- `stat` is the one statistic: `rate` or `count` for booleans, `mean`, `median`, `min`, `max` or `sum` for numbers.
- `better` is `"higher"` or `"lower"`, or left out when neither is.

One command can feed several metrics: have it print JSON, and give each metric a `score` that parses `stdout`.

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

✅ **Do** return `undefined` from a `score` when the metric doesn't apply, e.g. the file it reads is missing.

❌ **Don't** return 0 or `false` to mean "doesn't apply".

**Why:** a 0 is counted in the statistic, and drags it down. `undefined` leaves the run out, and `show` says why.

⚠️ **Warning:** `shell` stores the command's stdout in the run data store as it is, up to 64 KiB. A command that prints secrets or other sensitive data will persist them. Nothing transforms the output before it's stored.

✅ **Do** use `shell` to run the project's own typecheck and tests.

❌ **Don't** reimplement a check with `grep` that a command already does properly.

**Why:** The project's tests are the definition of "not broken". A regex is only an approximation of them.

### 5. Make the code state able to measure

The measurements run in the agent's container after it finishes. Whatever they need must be in the image.

- Dependencies installed, e.g. `bun install --frozen-lockfile` in the code state
- Tools on the path, e.g. bun in the base image

A changed code state needs a new pinned commit, and that commit must be pushed before the image can build.

**Why:** A `shell` check that fails because a dependency is missing reads as an agent failure.

### 6. Check the starting state

Before any agent runs, check the code state by hand:

- The checks for the task's own changes should fail
- The typecheck and test suite should pass

✅ **Do** fix or drop any check that already passes, or already fails, before the agent starts.

❌ **Don't** start a paid run before checking the starting state.

**Why:** A check that already passes measures nothing. If the test suite already fails, every run looks like the agent broke it.

### 7. Write the test case and dry-run it

Start small: one harness and model, one iteration.

e.g.

```ts
import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["main"],
  promptSet: ["none"],
  harnessModel: ["claude-code-2.1.311/claude-haiku-5-5"],
  task: "add-json-flag",
  initialPrompt: ["plain"],
  iterations: 1,
});
```

Then:

```sh
thunderjar generate
thunderjar plan <test case>
thunderjar build <test case>
```

Add models and iterations once a single run measures what you expect.

**Why:** A broken measurement found after twenty runs costs twenty runs.
