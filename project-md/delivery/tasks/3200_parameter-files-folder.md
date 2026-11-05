# 3200: Only `files/` goes into the build

A parameter's `ctx.dir` is its `files/` folder in the build context. Only that folder is copied in, so a parameter's `index.ts` and any helper code beside it never reach the build. A fragment can only use its own `files/`: naming another parameter's folder in the build context is a config error.

## Version bump type

major

## Artifacts

- `ctx.dir` points at `<parameter>/files/`, copied into the build context with symlinks followed. A parameter without a `files/` folder copies nothing.
- A config error for a fragment that names another parameter's folder, `parameters/<role>`
- `init`'s `house-style` prompt set copies `COPY ${ctx.dir}/ /workspace/`
- Scenario `0208_parameter_files`, and prompt set `trespasser` in `0402_broken_declarations`

```
harnessModels/fake-scripted/
  index.ts              never copied
  notes.md              never copied
  files/
    scripts/agent.sh    COPY ${ctx.dir}/scripts/ /opt/fake-scripted/
```

## Example CLI Output

```
$ thunderjar build trespassing-prompt-set --dry-run
Error: .thunderjar/test-case-parameters/promptSets/trespasser/index.ts: applyParameter: uses another parameter's folder in the build context: the harness's, parameters/harness. A fragment can only use its own files/, through ctx.dir.
```

## Tests

- Fixture + stdout tests of `build --dry-run`
- Fake Docker tests of what `build` puts in the build context
- Unit tests of `renderPrerun`

## Human interventions

None.
