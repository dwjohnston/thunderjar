# 0500: Implement plan

`thunderjar plan` loads the project's configuration and summarises it. Broken configuration is reported clearly on stderr, with a non-zero exit code, instead of a stack trace.

The full permutation matrix comes in 0600.

From row 4. See [planned reapplication](../../research/planned-reapplication.md), step 5.

## Version bump type

minor

## Artifacts

- `thunderjar plan` fills in the existing stub
- Error reporting in the config loader
- Scenarios in `fixtures/04_unhappy/`:
  - broken declarations
  - a broken harness family
  - empty parameter folders

## Example CLI Output

```
$ thunderjar plan
baseImage:     node20
codeState:     baseline
promptSet:     snerk
harnessModel:  fake-harness-alpha@1.0.0/fake-model-small
task:          is-prime
initialPrompt: plain

$ thunderjar plan
Error: .thunderjar/tasks/ has no tasks
$ echo $?
1
```

## Tests

- Fixture + stdout tests, against `0201_minimal_existing_setup`
- Fixture + stdout tests against the `04_unhappy/` scenarios, asserting on stderr and the exit code

## Human interventions

None.
