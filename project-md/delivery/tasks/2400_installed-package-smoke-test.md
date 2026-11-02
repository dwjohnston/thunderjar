# 2400: Installed package smoke test

CI packs Thunderjar, installs it into an empty folder the way a user would, and runs `init`, `generate`, `plan` and `run --dry-run` there.

Every test so far runs Thunderjar from source. This one proves the published package works on its own.

## Version bump type

none

## Artifacts

- `bun run test:package`: packs, installs into a temp folder, runs the commands
- A CI job running it

## Example CLI Output

```
$ bun run test:package
packed thunderjar-0.2.0.tgz
installed into <temp>
thunderjar init              ok
thunderjar generate          ok
thunderjar plan example      ok
thunderjar run example --dry-run   ok
```

## Tests

- The smoke test itself

## Human interventions

None.
