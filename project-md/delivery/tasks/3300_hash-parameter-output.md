# 3300: Parameter hash = output text + `files/`

A parameter's hash is now of what it produces, not of its source folder. Editing a comment or a helper changes nothing, and two runs can be compared parameter by parameter: "for this task, these parameters stayed the same, this one changed".

## Version bump type

major

## Artifacts

- Each parameter hash is of:

  | Parameter | Hashed |
  |---|---|
  | Base image | Rendered fragment, `files/` contents, `runOptions` |
  | Code state, prompt set | Rendered fragment, `files/` contents |
  | Harness | Rendered fragment (with its version), `cli` rendered with fixed sample values for turn 0 and turn 1, `requiredEnv`, `files/` contents |
  | Initial prompt | Rendered fragment, prompt text (or turns), `timeoutSeconds` |

- The permutation hash, which identifies runs, is of every parameter hash and the model ID.
- The prerun image hash is of the Dockerfile and each folder parameter's `files/`, and nothing else. Prerun images are tagged with it, so permutations that build the same image share it: two models of one harness, or two initial prompts without a fragment.
- `plan` and `build` render every fragment, so a fragment that throws is a config error in `plan` too.
- `hashPermutations` moves to `src/execution/hashPermutations.ts`, and the folder-walk exclusions (`HARNESS_MAPS`) go.

## Example CLI Output

`plan` shows the permutation hash. Permutations 1 and 2 differ only in their initial prompt, which has no fragment, so they share a prerun image:

```
$ thunderjar plan is-prime-baseline
...
 1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   6274bd13  built
 2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse   fe8d47cc  built

$ thunderjar build is-prime-baseline --dry-run
# thunderjar-prerun:b9cd78e6
...
```

## Tests

- Unit tests of `hashPermutations`: editing a comment changes no hash, changing a commit changes only the code state's hash, changing a file in `files/` changes only its parameter's hash, and two models of one harness share a prerun image
- Fixture + stdout tests of `plan`, `build --dry-run` and `run --dry-run`

## Human interventions

None. Existing prerun images are rebuilt once, under their new tags.
