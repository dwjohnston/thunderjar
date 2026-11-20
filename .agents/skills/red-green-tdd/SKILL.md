---
name: red-green-tdd
description: Required commit workflow for any change in this repo. CI enforces red/green TDD with one failing test per red commit. Use for every bug fix, feature, refactor, breaking change or chore.
---

# Red/Green TDD

Every task in this codebase is one of these five types:

| Task | Behaviour changes? | Existing expectations change? | Red step |
|---|---|---|---|
| Refactor / perf | No | No | None. Always green |
| New functionality | Yes | No | Add one failing test |
| Bug fix | Yes | Usually no (sometimes yes, if a test encoded the bug) | Add (or correct) one failing test |
| Breaking change | Yes | Yes | Change one existing expectation so it fails |
| Chore (deps, config, CI, docs, test infra) | No | No | None. Always green |

Work out which type your task is before you write any code.

## The rules

CI strictly enforces a red/green TDD workflow. Any functional change must be preceded by a commit that changes a test.

Commit message format:

```
🔴 Add test demonstrating <behaviour>
🟢 Add functionality solving <behaviour>
♻️ Refactor <what>            # no behaviour change, all tests stay green
```

CI checks:

1. **One failing test per 🔴 commit.** At a 🔴 commit, exactly one test fails, and it must be a test that commit added or changed. Every other test passes.
2. **The 🔴 test must fail on an assertion**, not on an import, type or syntax error. If the code under test doesn't exist yet, include a minimal stub (a signature that throws or returns a wrong value) in the 🔴 commit.
3. **🟢 commits never touch test files.** At a 🟢 commit, all tests pass.
4. **♻️ commits may change test *code* but not test *expectations*.** Renaming an import or moving a file is fine. Changing what an assertion checks is not.
5. **Test changes in a commit without one of these markers fail CI.**

Do not write multiple failing tests in one commit. If a change needs several tests, split it into several 🔴/🟢 cycles, one behaviour each.

If the 🟢 commit for one test makes a later test pass before you've written it, your 🟢 did more than the minimum. Implement less in each 🟢.

## Workflow by task type

### New functionality

Break the work into individual behaviours. 

For each behaviour: 🔴 one test → 🟢 minimal implementation → optional ♻️. 

Put preparatory refactors ("make the change easy") *before* the 🔴, as their own ♻️ commit.

### Bug fixes 

Add a single 🔴 test that demonstrates the buggy behaviour, then 🟢 to fix it. 

If the bug is already encoded into many tests, then use 🔴🔴 to change the tests, then fix behaviour. 

### Refactor / chore

♻️ commits only. Every commit is green.

#### Tests refactor

A change may just be updating descriptions or other not behavioural changes to the tests. Use ♻️


### Breaking change

Use expand/contract so the flip only breaks one test:

1. Expand: add the new behaviour behind an option, using normal 🔴/🟢 cycles.
2. Migrate: ♻️ change existing tests to select the old behaviour explicitly.
3. Flip: 🔴 change the one test that asserts the default → 🟢 change the default.
4. Contract: remove the old behaviour if no longer needed.

## Exception: multi-expectation red

If expand/contract really isn't practical, use:

```
🔴🔴 Update expectations for <change>
```

A 🔴🔴 commit may contain several failing tests, but:
- every failing test must be one the commit modified
- it may not add new tests, only change existing expectations
- the following 🟢 commit still must not touch test files
- the PR needs a human-approved label

This is a last resort. Never use it to batch new behaviour.

## Example: `envlint`

`envlint` is a CLI that lints `.env` files:

```
$ envlint .env
.env:3  duplicate key DATABASE_URL (first defined on line 1)
.env:7  empty value for API_KEY
2 problems found
```

### New functionality: `--format json`

```
🔴 Add test demonstrating --format json outputs problems as JSON
🟢 Add functionality solving --format json output
♻️ Refactor format handling into a reporters map
🔴 Add test demonstrating --format rejects unknown values
🟢 Add functionality solving unknown --format rejection
```

The first 🔴 test, written at the CLI boundary so it fails on the assertion and not on an import:

```ts
test("--format json outputs problems as JSON", async () => {
  const out = await run(["--format", "json", "fixtures/duplicate.env"]);
  expect(JSON.parse(out.stdout)).toEqual([
    { file: "fixtures/duplicate.env", line: 3, rule: "duplicate-key", message: "..." },
  ]);
});
```

### Bug fix: `PASSWORD="a=b"` value truncated

```
🔴 Add test demonstrating quoted values containing = are parsed whole
🟢 Add functionality solving = inside quoted values
```

### Breaking change: eslint-style text output as the default

```
🔴 Add test demonstrating --format eslint output
🟢 Add functionality solving --format eslint output
♻️ Refactor tests to pass --format text explicitly
🔴 Add test demonstrating eslint is the default format
🟢 Add functionality solving eslint as the default format
```

### Wrong: multiple failing tests in one red

```
🔴 Add tests for --format json, empty output and invalid values   ❌ CI fails
```

Split it into three 🔴/🟢 cycles.

### When 🔴🔴 is appropriate

Use 🔴🔴 only when one behaviour change necessarily changes many existing expectations, *and* putting the old behaviour behind an option would be pointless or harmful.

**✅ A bug encoded across many tests.** Line numbers are off by one: `envlint` reports 0-based lines, and 14 tests assert the wrong numbers. Nobody should be able to opt into the old, wrong line numbers, so expand/contract makes no sense.

```
🔴🔴 Update expectations for 1-based line numbers
🟢 Add functionality solving off-by-one line numbers
```

**✅ A wording correction shared by every rule's output.** The common message suffix `(first defined on line N)` is misspelled, or is wrong in a way that's baked into the expectations of every rule test. It's one fix in the code and many expectation edits.

```
🔴🔴 Update expectations for corrected problem message wording
🟢 Add functionality solving incorrect problem message wording
```

### When 🔴🔴 is NOT appropriate

**❌ New behaviour.** Adding `--format json` with several tests is a series of single 🔴/🟢 cycles. 🔴🔴 may not add new tests.

**❌ A deliberate breaking change that can be staged.** Switching the default output to eslint-style can use expand/contract (see above), so it must.

**❌ To save commits.** "These three tests are related" is not a reason. Related tests are still separate cycles.

**❌ When some failures aren't caused by the expectation change.** If a 🔴🔴 commit makes a test fail that the commit didn't modify, you've broken something. Fix it; don't widen the commit.
