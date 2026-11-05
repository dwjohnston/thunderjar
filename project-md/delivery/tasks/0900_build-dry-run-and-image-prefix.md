# 0900: Build dry run and image prefix

`thunderjar build --dry-run` prints each prerun Dockerfile and builds nothing. `plan` shows whether each image already exists.

`--image-prefix` lands here, before the first real-Docker test needs it.

From rows 23, 24 and 15. See [planned reapplication](../../research/planned-reapplication.md), step 9.

## Version bump type

minor

## Artifacts

- `thunderjar build --dry-run`
- `--image-prefix`
- Image status in `thunderjar plan`
- A fake Docker for tests

## Example CLI Output

```
$ thunderjar build --dry-run
# thunderjar-prerun:a1b2c3d4
FROM node:20
COPY ...

$ thunderjar plan
 1  node20 | baseline | snerk | fake-harness-alpha | plain   a1b2c3d4  built
 2  node20 | baseline | snerk | fake-harness-alpha | terse   e5f6a7b8  missing
```

## Tests

- Fixture + stdout tests, using the fake Docker

## Human interventions

None.
