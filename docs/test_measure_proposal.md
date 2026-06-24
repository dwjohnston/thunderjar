## Test measurement proposal (template-driven)

### Summary

We want a built-in measurer that can validate correctness by **materialising a test file from a template into the worktree**, then **running a test command**, then **capturing the result as a measure**.

This is distinct from “tests pass” (which is just `commandExitCode` against a repo’s normal test suite). This measurer is for *targeted* correctness checks that can be applied across tasks, even if the repo doesn’t already contain the relevant test.

### Terminology alignment

- **measurer**: reusable evaluator definition
- **measurement**: task-level application of a measurer (may be named/id’ed)
- **measure**: the outcome/value produced by running a measurement (stored in results)

### Lifecycle (intended execution order)

1. Worktree is created
2. Agent/harness runs (modifies repo)
3. Measurements are applied sequentially (one by one)
4. When the runner reaches a “test template” measurement:
   - write the templated test file into the worktree
   - run a test command targeting that file (or a configured runner)
   - capture stdout/stderr/exitCode and store as the measure

### Name ideas (best-first)

- `templateTest` (recommended): describes what it does without colliding with “harness”
- `fixtureTest`: common term, but slightly less explicit than “template”
- `goldenTest`: only if we decide this is “golden/snapshot” oriented
- `correctnessTest`: aligns with existing legacy measurement type name `correctness-test`

Notes:
- Avoid `harnessTest` (confuses with the “harness” concept).
- If we keep the legacy measurement type `correctness-test`, the measurer can still be named `templateTest` (or vice versa); we can map between them in the builder/runner for backwards compatibility.

### Proposed measurement config shape

Minimum viable config:
- `templatePath`: where to read the template from (within the repo/config context)
- `outputPath`: where to write the generated test file in the worktree
- `run` (optional): command to execute (defaults TBD)
- `expectedExitCode` (optional): default `0`

Example (conceptual):

```ts
{
  measurementId: "add_function_correctness",
  measurerName: "templateTest",
  config: {
    templatePath: "evaluation-sandbox/tests/add.test.ts.template",
    outputPath: "test/add.test.ts",
    run: "bun test test/add.test.ts",
    expectedExitCode: 0,
  }
}
```

### Measure/result shape (what gets recorded)

Recommended stored value for this measurer:

```ts
{
  exitCode: number,
  stdout: string,
  stderr: string
}
```

Pass/fail is derived from `exitCode === expectedExitCode` (default expectedExitCode=0).

### Open questions / decisions

- **Template substitution**: are templates copied verbatim, or do we support placeholder substitution (e.g. `{taskId}`, `{worktreePath}`, `{measurementId}`, etc.)?
- **Default `run`**: do we default to `config.commands.testRunner` (repo-level), or require an explicit `run` that targets the generated file?
- **Cleanup**: do we keep generated tests committed in the worktree, or treat them as temporary artifacts only used for measurement?
- **Working directory**: should test execution run in `worktreePath` or `commands.harnessWorkingDirectory`?

