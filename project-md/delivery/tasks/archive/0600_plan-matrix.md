# 0600: Plan matrix

`thunderjar plan` prints every permutation of the experiment, with content hashes.

Adds the typical project scenario: both fake agents, two prompt sets and two wordings of the task.

From row 5. See [planned reapplication](../../research/planned-reapplication.md), step 6.

## Version bump type

minor

## Artifacts

- `thunderjar plan` prints the permutation matrix
- Scenario `fixtures/02_regular/0202_typical_project/`

## Example CLI Output

```
$ thunderjar plan
promptSet:     snerk, glurk
harnessModel:  fake-harness-alpha, fake-harness-beta
initialPrompt: plain, terse

Matrix shape: 1/1/2/2/2 (8 permutations)

 1  node20 | baseline | snerk | fake-harness-alpha | plain   a1b2c3d4
 2  node20 | baseline | snerk | fake-harness-alpha | terse   e5f6a7b8
...
```

## Tests

- Fixture + stdout tests, against `0202_typical_project`

## Human interventions

None.
